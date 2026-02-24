;(function () {
  /** Default extension settings keys and values */
  const defaultSettings = {
    delaySeconds: 10,
    enabled: false,
    refreshEnabled: false,
    refreshIntervalSeconds: 60,
    scrollEnabled: false,
    scrollIntervalSeconds: 5
  }
  /** CSS selector for like button in timeline */
  const likeButtonSelector = '[data-testid="like"]'
  /** Browser or Chrome runtime API */
  const runtime = typeof browser !== 'undefined' ? browser.runtime : chrome.runtime
  /** Browser or Chrome storage API */
  const storage = typeof browser !== 'undefined' ? browser.storage : chrome.storage
  /** Local storage area for extension settings */
  const local = storage.local
  /** Runtime state for delay, intervals, timers, queue, observer */
  let delayMs = 10000
  let enabled = false
  let observer = null
  let queue = []
  let queued = new WeakSet()
  let queueTimer = null
  let refreshEnabled = false
  let refreshIntervalMs = 60000
  let refreshTimer = null
  let scrollEnabled = false
  let scrollIntervalMs = 5000
  let scrollTimer = null

  /**
   * Clamp milliseconds to min-max range.
   * @description Returns value bounded by min and max milliseconds.
   * @param valueMs - Value in milliseconds
   * @param minMs - Minimum milliseconds
   * @param maxMs - Maximum milliseconds
   * @returns Clamped value in milliseconds
   */
  function clampMs(valueMs, minMs, maxMs) {
    return Math.max(minMs, Math.min(maxMs, valueMs))
  }

  /**
   * Check if element can scroll vertically.
   * @description Has overflow scroll/auto and content taller than view.
   * @param element - DOM element to test
   * @returns True when element is scrollable
   */
  function isScrollable(element) {
    if (!element || element.nodeType !== 1) {
      return false
    }
    const computedStyle = getComputedStyle(element)
    const overflowY = computedStyle.overflowY
    return (
      (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
      element.scrollHeight > element.clientHeight
    )
  }

  /**
   * Detect X/Twitter home timeline page.
   * @description Path /home and host x.com or twitter.com.
   * @returns True when on home page
   */
  function isHomePage() {
    const locationPath = location.pathname
    const locationHost = location.hostname
    return (
      (locationPath === '/home' || locationPath.startsWith('/home?')) &&
      (locationHost === 'x.com' ||
        locationHost === 'www.x.com' ||
        locationHost === 'twitter.com' ||
        locationHost === 'www.twitter.com')
    )
  }

  /**
   * Apply stored settings to module state.
   * @description Writes each defined key into module state.
   * @param storedItems - Storage result with delay, enabled, refresh, scroll keys
   */
  function applySettings(storedItems) {
    if (storedItems.delaySeconds !== undefined) {
      delayMs = clampMs(storedItems.delaySeconds * 1000, 1000, 10000)
    }
    if (storedItems.enabled !== undefined) {
      enabled = !!storedItems.enabled
    }
    if (storedItems.refreshEnabled !== undefined) {
      refreshEnabled = !!storedItems.refreshEnabled
    }
    if (storedItems.refreshIntervalSeconds !== undefined) {
      refreshIntervalMs = clampMs(storedItems.refreshIntervalSeconds * 1000, 30000, 300000)
    }
    if (storedItems.scrollEnabled !== undefined) {
      scrollEnabled = !!storedItems.scrollEnabled
    }
    if (storedItems.scrollIntervalSeconds !== undefined) {
      scrollIntervalMs = clampMs(storedItems.scrollIntervalSeconds * 1000, 2000, 15000)
    }
  }

  /**
   * Find first scrollable descendant.
   * @description Recursively checks element then children for scrollable.
   * @param element - Root DOM element to search
   * @returns Scrollable element or null
   */
  function findScrollable(element) {
    if (!element || element.nodeType !== 1) {
      return null
    }
    if (isScrollable(element)) {
      return element
    }
    for (let childIndex = 0; childIndex < element.children.length; childIndex++) {
      const scrollableChild = findScrollable(element.children[childIndex])
      if (scrollableChild) {
        return scrollableChild
      }
    }
    return null
  }

  /**
   * Resolve scroll container for timeline.
   * @description Prefers primaryColumn scrollable, else document root.
   * @returns Scrollable container element or null
   */
  function getScrollContainer() {
    const primaryColumn = document.querySelector('[data-testid="primaryColumn"]')
    if (primaryColumn) {
      const scrollableInside = findScrollable(primaryColumn)
      if (scrollableInside) {
        return scrollableInside
      }
      let currentElement = primaryColumn.parentElement
      while (currentElement && currentElement !== document.body) {
        if (isScrollable(currentElement)) {
          return currentElement
        }
        currentElement = currentElement.parentElement
      }
    }
    const rootElement = document.scrollingElement || document.documentElement
    return rootElement.scrollHeight > rootElement.clientHeight ? rootElement : null
  }

  /**
   * Perform one smooth scroll step.
   * @description Scrolls window or timeline container by fixed amount.
   */
  function doScroll() {
    const scrollAmount = 500
    const scrollOptions = { top: scrollAmount, behavior: 'smooth' }
    const scrollContainer = getScrollContainer()
    if (!scrollContainer) {
      window.scrollBy(scrollOptions)
      return
    }
    if (
      scrollContainer === document.documentElement ||
      scrollContainer === document.body ||
      scrollContainer === document.scrollingElement
    ) {
      window.scrollBy(scrollOptions)
    } else {
      const targetTop = Math.min(
        scrollContainer.scrollHeight - scrollContainer.clientHeight,
        scrollContainer.scrollTop + scrollAmount
      )
      scrollContainer.scrollTo({ top: targetTop, behavior: 'smooth' })
    }
  }

  /**
   * Start periodic auto-scroll timer.
   * @description Clears old timer then sets interval from scrollIntervalMs.
   */
  function startScroll() {
    stopScroll()
    scrollTimer = setInterval(() => {
      if (scrollEnabled) {
        doScroll()
      }
    }, scrollIntervalMs)
  }

  /**
   * Stop auto-scroll interval.
   * @description Clears scroll timer and resets handle.
   */
  function stopScroll() {
    if (scrollTimer) {
      clearInterval(scrollTimer)
      scrollTimer = null
    }
  }

  /**
   * Start periodic page refresh on home.
   * @description No-op when not home; else sets refresh interval.
   */
  function startRefresh() {
    if (!isHomePage()) {
      return
    }
    stopRefresh()
    refreshTimer = setInterval(() => {
      if (refreshEnabled && isHomePage()) {
        runtime.sendMessage({
          type: 'X_BOOST_REFRESH_RESET',
          intervalSeconds: Math.round(refreshIntervalMs / 1000)
        })
        location.reload()
      }
    }, refreshIntervalMs)
  }

  /**
   * Stop page refresh timer.
   * @description Clears refresh interval and resets handle.
   */
  function stopRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer)
      refreshTimer = null
    }
  }

  /**
   * Write current queue length to storage.
   * @description Lets popup show queue stat without messaging.
   */
  function syncQueueLength() {
    local.set({ queueLength: queue.length })
  }

  /**
   * Process next like button in queue.
   * @description Shifts one button, clicks if valid, reschedules or clears.
   */
  function processQueue() {
    if (queue.length === 0) {
      queueTimer = null
      local.set({ queueLength: 0 })
      return
    }
    const likeButton = queue.shift()
    syncQueueLength()
    if (
      likeButton &&
      document.contains(likeButton) &&
      likeButton.getAttribute('data-testid') === 'like'
    ) {
      likeButton.click()
    }
    queueTimer = setTimeout(processQueue, delayMs)
  }

  /**
   * Queue like button for delayed click.
   * @description Skips invalid or queued; pushes and starts processor.
   * @param likeButtonEl - Like button element
   */
  function scheduleLike(likeButtonEl) {
    if (
      !likeButtonEl ||
      likeButtonEl.getAttribute('data-testid') !== 'like' ||
      queued.has(likeButtonEl)
    ) {
      return
    }
    queued.add(likeButtonEl)
    queue.push(likeButtonEl)
    syncQueueLength()
    if (!queueTimer) {
      queueTimer = setTimeout(processQueue, delayMs)
    }
  }

  /**
   * Queue like buttons under root element.
   * @description Queries likeButtonSelector and schedules each if enabled.
   * @param root - Container to search (defaults to body)
   */
  function scanLikeButtons(root) {
    if (!enabled) {
      return
    }
    const scanTarget = root || document.body
    if (!scanTarget) {
      return
    }
    const likeButtons = scanTarget.querySelectorAll(likeButtonSelector)
    likeButtons.forEach(likeButtonEl => scheduleLike(likeButtonEl))
  }

  /**
   * Start observer for new like buttons.
   * @description Observes body subtree and scans added nodes.
   */
  function startObserving() {
    if (observer) {
      return
    }
    observer = new MutationObserver(mutationsList => {
      for (const mutationRecord of mutationsList) {
        if (mutationRecord.addedNodes.length) {
          mutationRecord.addedNodes.forEach(addedNode => {
            if (addedNode.nodeType === 1) {
              scanLikeButtons(addedNode)
            }
          })
        }
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    scanLikeButtons()
  }

  /**
   * Stop observer and clear like queue.
   * @description Disconnects MutationObserver and clears queue timer.
   */
  function stopObserving() {
    if (observer) {
      observer.disconnect()
      observer = null
    }
    if (queueTimer) {
      clearTimeout(queueTimer)
      queueTimer = null
    }
    queue = []
    local.set({ queueLength: 0 })
  }

  /**
   * Load settings and start features.
   * @description Gets settings from storage; starts observers and timers.
   */
  function init() {
    local.get(defaultSettings, storedItems => {
      applySettings(storedItems)
      if (enabled) {
        startObserving()
      }
      if (refreshEnabled) {
        startRefresh()
      }
      if (scrollEnabled) {
        startScroll()
      }
    })
  }

  /**
   * Reapply settings on storage change.
   * @description Fetches storage then applySettings and start/stop timers.
   * @param storageChanges - Map of key to { oldValue, newValue }
   * @param areaName - Storage area; we only handle local
   */
  storage.onChanged.addListener((storageChanges, areaName) => {
    if (areaName !== 'local') {
      return
    }
    local.get(defaultSettings, storedItems => {
      applySettings(storedItems)
      if (enabled) {
        startObserving()
      } else {
        stopObserving()
      }
      stopRefresh()
      if (refreshEnabled) {
        startRefresh()
      }
      stopScroll()
      if (scrollEnabled) {
        startScroll()
      }
    })
  })
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
