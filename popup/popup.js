/** Default extension settings keys and values */
const defaultSettings = {
  delaySeconds: 10,
  enabled: false,
  refreshEnabled: false,
  refreshIntervalSeconds: 60,
  scrollEnabled: false,
  scrollIntervalSeconds: 5
}
/** Delay input for like interval (seconds) */
const delayInputEl = document.getElementById('delay')
/** Min/max bounds for refresh and scroll intervals */
const limits = {
  refreshMax: 300,
  refreshMin: 30,
  scrollMax: 15,
  scrollMin: 2
}
/** Browser or Chrome storage API */
const storage = typeof browser !== 'undefined' ? browser.storage : chrome.storage
/** Local storage area for extension settings */
const local = storage.local
/** Refresh interval number input element */
const refreshIntervalInputEl = document.getElementById('refresh-interval')
/** Scroll interval number input element */
const scrollIntervalInputEl = document.getElementById('scroll-interval')
/** Queue length display in stat card */
const statQueueEl = document.getElementById('stat-queue')
/** Auto like feed toggle checkbox */
const toggleEnabledEl = document.getElementById('toggle-enabled')
/** Refresh home toggle checkbox */
const toggleRefreshEl = document.getElementById('toggle-refresh')
/** Auto scroll toggle checkbox */
const toggleScrollEl = document.getElementById('toggle-scroll')

/**
 * Clamp number to inclusive range.
 * @description Returns value bounded by min and max.
 * @param minBound - Lower bound
 * @param maxBound - Upper bound
 * @param value - Value to clamp
 * @returns Clamped number
 */
function clamp(minBound, maxBound, value) {
  return Math.max(minBound, Math.min(maxBound, value))
}

/**
 * Bind stepper UI to storage key.
 * @description Wires input and +/- buttons to clamp and storage.
 * @param inputElement - Number input element
 * @param minusButtonId - ID of minus button
 * @param plusButtonId - ID of plus button
 * @param storageKey - Storage key to write
 * @param clampFn - Clamp function for raw value
 * @param defaultValue - Fallback when input empty or invalid
 * @param stepSize - Step for minus/plus clicks
 */
function bindStepper(
  inputElement,
  minusButtonId,
  plusButtonId,
  storageKey,
  clampFn,
  defaultValue,
  stepSize
) {
  const syncToStorage = rawValue => {
    const clampedValue = clampFn(rawValue)
    inputElement.value = clampedValue
    local.set({ [storageKey]: clampedValue })
  }
  const currentValue = () => parseInt(inputElement.value, 10) || defaultValue
  inputElement.addEventListener('change', () => syncToStorage(currentValue()))
  document
    .getElementById(minusButtonId)
    .addEventListener('click', () => syncToStorage(currentValue() - stepSize))
  document
    .getElementById(plusButtonId)
    .addEventListener('click', () => syncToStorage(currentValue() + stepSize))
}

/**
 * Update queue stat in dashboard.
 * @description Writes queue length to stat card element.
 * @param queueLength - Current like queue length
 */
function updateQueueStat(queueLength) {
  statQueueEl.textContent = String(queueLength ?? 0)
}

/**
 * Load settings into popup UI.
 * @description Gets defaultSettings then fills inputs and toggles.
 */
function load() {
  const storageKeys = {
    ...defaultSettings,
    queueLength: 0
  }
  local.get(storageKeys, storedItems => {
    delayInputEl.value = clamp(1, 10, storedItems.delaySeconds)
    refreshIntervalInputEl.value = clamp(
      limits.refreshMin,
      limits.refreshMax,
      storedItems.refreshIntervalSeconds || 60
    )
    scrollIntervalInputEl.value = clamp(
      limits.scrollMin,
      limits.scrollMax,
      storedItems.scrollIntervalSeconds ?? 5
    )
    toggleEnabledEl.checked = !!storedItems.enabled
    toggleRefreshEl.checked = !!storedItems.refreshEnabled
    toggleScrollEl.checked = !!storedItems.scrollEnabled
    updateQueueStat(storedItems.queueLength)
  })
}

/**
 * Sync popup on storage change.
 * @description Updates queue stat when queueLength changes in local.
 * @param storageChanges - Storage change map (key to oldValue, newValue)
 * @param areaName - Storage area; we only handle local
 */
storage.onChanged.addListener((storageChanges, areaName) => {
  if (areaName !== 'local') {
    return
  }
  if (storageChanges.queueLength) {
    updateQueueStat(storageChanges.queueLength.newValue)
  }
})
toggleEnabledEl.addEventListener('change', () => {
  local.set({ enabled: toggleEnabledEl.checked })
})
toggleRefreshEl.addEventListener('change', () => {
  local.set({ refreshEnabled: toggleRefreshEl.checked })
})
toggleScrollEl.addEventListener('change', () => {
  local.set({ scrollEnabled: toggleScrollEl.checked })
})
bindStepper(
  delayInputEl,
  'delay-minus',
  'delay-plus',
  'delaySeconds',
  value => clamp(1, 10, value),
  10,
  1
)
bindStepper(
  refreshIntervalInputEl,
  'refresh-minus',
  'refresh-plus',
  'refreshIntervalSeconds',
  value => clamp(limits.refreshMin, limits.refreshMax, value),
  60,
  10
)
bindStepper(
  scrollIntervalInputEl,
  'scroll-minus',
  'scroll-plus',
  'scrollIntervalSeconds',
  value => clamp(limits.scrollMin, limits.scrollMax, value),
  5,
  1
)
load()
