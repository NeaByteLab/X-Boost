/**
 * Badge countdown for auto-refresh.
 * @description Shows seconds until next refresh on icon.
 */
;(function () {
  /** Browser or Chrome API namespace */
  const browserOrChrome = typeof browser !== 'undefined' ? browser : chrome
  /** Extension icon (browserAction) API */
  const browserAction = browserOrChrome.browserAction
  /** Default keys for refresh settings we read */
  const defaultSettings = {
    refreshEnabled: false,
    refreshIntervalSeconds: 60
  }
  /** Runtime API for message listener */
  const runtime = browserOrChrome.runtime
  /** Storage API; local used for get/set */
  const storage = browserOrChrome.storage
  /** Local storage area for extension settings */
  const local = storage.local
  let applyRefreshTimeout = null
  let countdownSeconds = 0
  let countdownTimer = null
  let intervalSeconds = 60

  /**
   * Set badge text and color on icon.
   * @description Writes badge text; sets blue background when non-empty.
   * @param badgeText - Text to show on icon (empty clears)
   */
  function setBadge(badgeText) {
    browserAction.setBadgeText({ text: badgeText ? String(badgeText) : '' })
    if (badgeText) {
      browserAction.setBadgeBackgroundColor({ color: '#1d9bf0' })
    }
  }

  /**
   * Stop countdown and clear badge.
   * @description Clears interval and badge text.
   */
  function stopCountdown() {
    const timerId = countdownTimer
    countdownTimer = null
    if (timerId) {
      clearInterval(timerId)
    }
    setBadge('')
  }

  /**
   * Decrement countdown and update badge.
   * @description One tick per second; resets to interval when zero.
   */
  function tick() {
    if (!countdownTimer) {
      return
    }
    if (countdownSeconds <= 0) {
      return
    }
    countdownSeconds -= 1
    if (countdownSeconds <= 0) {
      countdownSeconds = intervalSeconds
      setBadge(countdownSeconds)
      return
    }
    setBadge(countdownSeconds)
  }

  /**
   * Start countdown from given seconds.
   * @description Starts countdown for badge from given seconds.
   * @param seconds - Seconds until next refresh
   */
  function startCountdown(seconds) {
    stopCountdown()
    if (!seconds || seconds < 1) {
      return
    }
    intervalSeconds = Math.max(1, Math.floor(seconds))
    countdownSeconds = intervalSeconds
    setBadge(countdownSeconds)
    countdownTimer = setInterval(tick, 1000)
  }

  /**
   * Reset countdown to given seconds.
   * @description Resets countdown when message received; keeps running.
   * @param seconds - New interval in seconds
   */
  function resetCountdown(seconds) {
    if (!countdownTimer) {
      return
    }
    intervalSeconds = seconds != null ? Math.max(1, Math.floor(seconds)) : intervalSeconds
    countdownSeconds = intervalSeconds
    setBadge(countdownSeconds)
  }

  /**
   * Apply refresh state and countdown.
   * @description If disabled stops countdown; else starts with interval.
   * @param refreshEnabled - Whether auto-refresh is enabled
   * @param refreshIntervalSeconds - Interval in seconds for badge
   */
  function applyRefreshState(refreshEnabled, refreshIntervalSeconds) {
    if (!refreshEnabled) {
      stopCountdown()
      return
    }
    startCountdown(refreshIntervalSeconds)
  }
  local.get(defaultSettings, storedItems => {
    applyRefreshState(!!storedItems.refreshEnabled, storedItems.refreshIntervalSeconds || 60)
  })

  /**
   * Reapply refresh state on storage change.
   * @description Only when refresh-related keys change; avoids resetting countdown on queueLength etc.
   * @param changes - Storage change map
   * @param areaName - Storage area; we only handle local
   */
  storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
      return
    }
    const refreshKeyChanged = 'refreshEnabled' in changes || 'refreshIntervalSeconds' in changes
    if (!refreshKeyChanged) {
      return
    }
    if (applyRefreshTimeout) {
      clearTimeout(applyRefreshTimeout)
    }
    applyRefreshTimeout = setTimeout(() => {
      applyRefreshTimeout = null
      local.get(defaultSettings, storedItems => {
        applyRefreshState(!!storedItems.refreshEnabled, storedItems.refreshIntervalSeconds || 60)
      })
    }, 50)
  })

  /**
   * Handle refresh reset message from content.
   * @description Resets countdown to interval from message.
   * @param incomingMessage - Message with type and intervalSeconds
   */
  runtime.onMessage.addListener(incomingMessage => {
    if (
      incomingMessage &&
      incomingMessage.type === 'X_BOOST_REFRESH_RESET' &&
      incomingMessage.intervalSeconds != null
    ) {
      resetCountdown(incomingMessage.intervalSeconds)
    }
  })
})()
