// 1 Block Elemente aus dem HTML holen
const reminderList = document.getElementById('reminderList');
const addReminderButton = document.getElementById('addReminderButton');
const dialogOverlay = document.getElementById('dialogOverlay');
const reminderText = document.getElementById('reminderText');
const reminderDatetime = document.getElementById('reminderDatetime');
const useDatetimeToggle = document.getElementById('useDatetimeToggle');
const datetimeSection = document.getElementById('datetimeSection');
const dialogMessage = document.getElementById('dialogMessage');
const cancelButton = document.getElementById('cancelButton');
const saveButton = document.getElementById('saveButton');

const STORAGE_KEY = 'erinnerungsapp_reminders';
const REMINDER_ACTION_TYPE_ID = 'reminder_actions';
const COMPLETE_REMINDER_ACTION_ID = 'complete_reminder';
let editIndex = null;
let remindersCache = [];

// 2 Block Plugin-Helfer und Datenhaltung
function getLocalNotifications() {
  return window.Capacitor?.Plugins?.LocalNotifications;
}

function getPreferences() {
  return window.Capacitor?.Plugins?.Preferences;
}

function createNotificationId() {
  return Math.floor(Math.random() * 2147483646) + 1;
}

function parseReminders(raw) {
  if (!raw) {
    return [];
  }

  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item) => item && typeof item === 'object' && typeof item.text === 'string');
  } catch (error) {
    console.warn('Could not parse reminders:', error);
    return [];
  }
}

async function loadRemindersFromStorage() {
  try {
    const preferences = getPreferences();
    if (preferences) {
      const { value } = await preferences.get({ key: STORAGE_KEY });
      if (value) {
        remindersCache = parseReminders(value);
        return remindersCache;
      }

      // Vorhandene Browser-Daten einmalig nach Preferences migrieren
      const legacy = localStorage.getItem(STORAGE_KEY);
      if (legacy) {
        remindersCache = parseReminders(legacy);
        await preferences.set({ key: STORAGE_KEY, value: JSON.stringify(remindersCache) });
        return remindersCache;
      }

      remindersCache = [];
      return remindersCache;
    }

    remindersCache = parseReminders(localStorage.getItem(STORAGE_KEY));
    return remindersCache;
  } catch (error) {
    console.warn('Could not load reminders:', error);
    remindersCache = parseReminders(localStorage.getItem(STORAGE_KEY));
    return remindersCache;
  }
}

function loadReminders() {
  return remindersCache;
}

async function saveReminders(reminders) {
  const safeReminders = Array.isArray(reminders) ? reminders : [];
  remindersCache = safeReminders;
  const serialized = JSON.stringify(safeReminders);

  try {
    const preferences = getPreferences();
    if (preferences) {
      await preferences.set({ key: STORAGE_KEY, value: serialized });
    }
  } catch (error) {
    console.warn('Could not save reminders to Preferences:', error);
  }

  try {
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch (error) {
    console.warn('Could not save reminders to localStorage:', error);
  }
}

async function cancelReminderNotification(notificationId) {
  if (!notificationId) {
    return;
  }

  const localNotifications = getLocalNotifications();
  if (!localNotifications) {
    return;
  }

  try {
    await localNotifications.cancel({ notifications: [{ id: notificationId }] });
  } catch (error) {
    console.warn('Could not cancel local notification:', error);
  }

  try {
    await localNotifications.removeDeliveredNotifications({
      notifications: [{ id: notificationId }]
    });
  } catch (error) {
    // Optional on platforms that do not support delivered notifications.
  }
}

async function ensureReminderActionTypes() {
  const localNotifications = getLocalNotifications();
  if (!localNotifications) {
    return;
  }

  await localNotifications.registerActionTypes({
    types: [{
      id: REMINDER_ACTION_TYPE_ID,
      actions: [{ id: COMPLETE_REMINDER_ACTION_ID, title: 'Erledigt' }]
    }]
  });
}

async function scheduleReminderNotification(reminder) {
  if (!reminder.datetime) {
    await cancelReminderNotification(reminder.notificationId);
    return { ok: true, skipped: true };
  }

  const scheduledAt = new Date(reminder.datetime);
  if (Number.isNaN(scheduledAt.getTime())) {
    console.warn('Could not schedule reminder: invalid date:', reminder.datetime);
    return { ok: false, reason: 'invalid' };
  }

  if (scheduledAt.getTime() <= Date.now()) {
    await cancelReminderNotification(reminder.notificationId);
    return { ok: false, reason: 'past' };
  }

  const localNotifications = getLocalNotifications();
  if (!localNotifications) {
    return { ok: false, reason: 'unavailable' };
  }

  try {
    let permission = await localNotifications.checkPermissions();
    if (permission.display !== 'granted') {
      permission = await localNotifications.requestPermissions();
    }

    if (permission.display !== 'granted') {
      console.warn('Notification permission was not granted.');
      return { ok: false, reason: 'permission' };
    }

    await ensureReminderActionTypes();
    await cancelReminderNotification(reminder.notificationId);

    await localNotifications.schedule({
      notifications: [{
        id: reminder.notificationId,
        title: 'Erinnerung',
        body: reminder.text,
        actionTypeId: REMINDER_ACTION_TYPE_ID,
        schedule: { at: scheduledAt, allowWhileIdle: true },
        autoCancel: true
      }]
    });
    return { ok: true };
  } catch (error) {
    // The reminder remains saved if scheduling is unavailable or rejected.
    console.warn('Could not schedule local notification:', error);
    return { ok: false, reason: 'error' };
  }
}

async function completeReminderByNotificationId(notificationId) {
  if (notificationId === null || notificationId === undefined) {
    return;
  }

  const targetId = Number(notificationId);
  const reminders = loadReminders();
  const reminderIndex = reminders.findIndex(
    reminder => Number(reminder.notificationId) === targetId
  );
  if (reminderIndex === -1) {
    await cancelReminderNotification(notificationId);
    return;
  }

  const [removed] = reminders.splice(reminderIndex, 1);
  await saveReminders(reminders);
  await cancelReminderNotification(removed?.notificationId ?? notificationId);
  renderReminders();
}

async function registerNotificationActions() {
  const localNotifications = getLocalNotifications();
  if (!localNotifications) {
    return;
  }

  try {
    await ensureReminderActionTypes();

    await localNotifications.addListener(
      'localNotificationActionPerformed',
      async ({ actionId, notification }) => {
        if (actionId !== COMPLETE_REMINDER_ACTION_ID) {
          return;
        }

        await completeReminderByNotificationId(notification?.id);
      }
    );
  } catch (error) {
    console.warn('Could not register notification actions:', error);
  }
}

// 3 Block Datenformatierung
function formatDateTime(value) {
  if (!value) {
    return 'Kein Datum';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Kein Datum';
  }

  return date.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function getFieldValue(element) {
  if (!element) {
    return '';
  }

  const currentValue = element.value;
  if (currentValue === null || currentValue === undefined || currentValue === '') {
    // ion-datetime ohne Auswahl / nach Clear
    if (element.tagName === 'ION-DATETIME') {
      return '';
    }
  } else if (typeof currentValue === 'string') {
    return currentValue;
  }

  if (element.tagName === 'ION-INPUT') {
    try {
      const input = await element.getInputElement();
      if (input && typeof input.value === 'string') {
        return input.value;
      }
    } catch (error) {
      console.warn('Could not read ion-input value:', error);
    }
  }

  if (element.shadowRoot) {
    const nativeInput = element.shadowRoot.querySelector('input, textarea');
    if (nativeInput && typeof nativeInput.value === 'string') {
      return nativeInput.value;
    }
  }

  return typeof currentValue === 'string' ? currentValue : '';
}

function bindButtonClick(button, handler) {
  if (!button) {
    return;
  }

  // Nur am Host-Element lauschen – ein zweiter Listener am Shadow-Button
  // würde denselben Klick doppelt auslösen.
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    handler(event);
  });
}

// 4 Block Erinnerungen anzeigen, UI aufbauen
function renderReminders() {
  const reminders = loadReminders();
  if (reminders.length === 0) {
    reminderList.innerHTML = `
      <ion-card class="empty-card">
        <ion-card-content>
          <p class="empty-state">Noch keine Erinnerungen gespeichert.</p>
        </ion-card-content>
      </ion-card>
    `;
    return;
  }

  reminderList.innerHTML = reminders.map((reminder, index) => {
    return `
      <ion-card class="reminder-card">
        <ion-card-content>
          <div class="reminder-row">
            <div class="reminder-main">
              <h3>${escapeHtml(reminder.text)}</h3>
              <p>${escapeHtml(formatDateTime(reminder.datetime))}</p>
            </div>
            <div class="reminder-actions">
              <ion-button class="edit-button" data-index="${index}" size="small" fill="clear">Bearbeiten</ion-button>
              <ion-button class="delete-button" data-index="${index}" size="small" fill="clear" color="danger">Löschen</ion-button>
            </div>
          </div>
        </ion-card-content>
      </ion-card>
    `;
  }).join('');

  document.querySelectorAll('.edit-button').forEach(button => {
    button.addEventListener('click', event => {
      const index = Number(event.currentTarget.dataset.index);
      editReminder(index);
    });
  });

  document.querySelectorAll('.delete-button').forEach(button => {
    button.addEventListener('click', event => {
      const index = Number(event.currentTarget.dataset.index);
      deleteReminder(index);
    });
  });
}

function toDatetimeLocalValue(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

function setDatetimeEnabled(enabled, value = null) {
  if (useDatetimeToggle) {
    useDatetimeToggle.checked = enabled;
  }

  if (datetimeSection) {
    datetimeSection.hidden = !enabled;
  }

  if (!reminderDatetime) {
    return;
  }

  if (enabled) {
    // Expliziten Wert setzen, damit „Heute 13:26“ wirklich gespeichert wird
    reminderDatetime.value = value || toDatetimeLocalValue();
    return;
  }

  if (typeof reminderDatetime.reset === 'function') {
    reminderDatetime.reset();
  }
  reminderDatetime.value = undefined;
}

function clearDialogMessage() {
  if (!dialogMessage) {
    return;
  }

  dialogMessage.hidden = true;
  dialogMessage.textContent = '';
  dialogMessage.removeAttribute('data-color');
}

function showDialogMessage(message, color = 'danger') {
  if (!dialogMessage) {
    return showMessage(message, color);
  }

  dialogMessage.textContent = message;
  dialogMessage.setAttribute('data-color', color);
  dialogMessage.hidden = false;
}

function openDialog(reminder = null, index = null) {
  if (dialogOverlay) {
    dialogOverlay.hidden = false;
    dialogOverlay.style.display = 'grid';
  }

  clearDialogMessage();
  const dialogTitle = dialogOverlay?.querySelector('ion-card-title');

  if (reminder) {
    reminderText.value = reminder.text;
    setDatetimeEnabled(Boolean(reminder.datetime), reminder.datetime || null);
    editIndex = index;
    saveButton.textContent = 'Aktualisieren';
    if (dialogTitle) {
      dialogTitle.textContent = 'Erinnerung bearbeiten';
    }
  } else {
    reminderText.value = '';
    setDatetimeEnabled(false);
    editIndex = null;
    saveButton.textContent = 'Speichern';
    if (dialogTitle) {
      dialogTitle.textContent = 'Neue Erinnerung';
    }
  }
}

function closeDialog() {
  clearDialogMessage();
  if (dialogOverlay) {
    dialogOverlay.hidden = true;
    dialogOverlay.style.display = 'none';
  }
}

function registerAppShortcutListener() {
  const appShortcuts = window.Capacitor?.Plugins?.AppShortcuts;
  if (!appShortcuts) {
    return;
  }

  appShortcuts.addListener('click', (event) => {
    const shortcutId = event?.shortcutId ?? event?.id;
    if (shortcutId === 'newReminder') {
      openDialog();
    }
  }).catch(error => {
    console.warn('Could not register app shortcut listener:', error);
  });
}

async function showMessage(message, color = 'danger') {
  try {
    const toast = document.createElement('ion-toast');
    toast.message = message;
    toast.duration = 2500;
    toast.color = color;
    toast.position = 'top';
    document.body.appendChild(toast);
    await toast.present();
  } catch (error) {
    window.alert(message);
  }
}

function editReminder(index) {
  const reminders = loadReminders();
  const reminder = reminders[index];
  if (!reminder) return;

  openDialog(reminder, index);
}

async function deleteReminder(index) {
  const reminders = loadReminders();
  const [removed] = reminders.splice(index, 1);
  if (!removed) {
    return;
  }

  await saveReminders(reminders);
  await cancelReminderNotification(removed.notificationId);
  renderReminders();
}

// 5 Block App-start und Aufbau
async function saveCurrentReminder() {
  const text = (await getFieldValue(reminderText)).trim();
  const useDatetime = Boolean(useDatetimeToggle?.checked);
  let datetime = null;

  if (useDatetime) {
    // Aktuell angezeigte Räder übernehmen (auch ohne extra Tippen)
    if (reminderDatetime && typeof reminderDatetime.confirm === 'function') {
      try {
        await reminderDatetime.confirm(true);
      } catch (error) {
        // Fallback auf element.value
      }
    }

    const datetimeRaw = await getFieldValue(reminderDatetime);
    datetime = typeof datetimeRaw === 'string' ? datetimeRaw.trim() : '';
    if (!datetime) {
      datetime = toDatetimeLocalValue();
    }
  }

  if (!text) {
    showDialogMessage('Bitte Text eingeben');
    return;
  }

  clearDialogMessage();

  const reminders = loadReminders();
  const previousReminder = editIndex !== null ? reminders[editIndex] : null;
  const reminder = {
    text,
    datetime,
    notificationId: previousReminder?.notificationId ?? createNotificationId()
  };

  if (editIndex !== null) {
    reminders[editIndex] = reminder;
  } else {
    reminders.push(reminder);
  }

  await saveReminders(reminders);
  const scheduleResult = await scheduleReminderNotification(reminder);
  closeDialog();
  renderReminders();

  if (scheduleResult?.reason === 'past') {
    await showMessage('Erinnerung gespeichert, aber die Zeit liegt in der Vergangenheit – keine Benachrichtigung geplant.', 'warning');
  } else if (scheduleResult?.reason === 'permission') {
    await showMessage('Erinnerung gespeichert, aber Benachrichtigungen sind nicht erlaubt.', 'warning');
  }
}

async function initApp() {
  // Shortcut-Listener früh registrieren, damit Kaltstart-Events nicht verloren gehen
  registerAppShortcutListener();
  await loadRemindersFromStorage();
  await registerNotificationActions();
  renderReminders();
}

if (addReminderButton) {
  bindButtonClick(addReminderButton, () => openDialog());
}
if (cancelButton) {
  bindButtonClick(cancelButton, closeDialog);
}
if (saveButton) {
  bindButtonClick(saveButton, saveCurrentReminder);
}
if (useDatetimeToggle) {
  useDatetimeToggle.addEventListener('ionChange', (event) => {
    const enabled = Boolean(event.detail?.checked ?? useDatetimeToggle.checked);
    setDatetimeEnabled(enabled, enabled ? toDatetimeLocalValue() : null);
  });
}

if (dialogOverlay) {
  dialogOverlay.hidden = true;
  dialogOverlay.style.display = 'none';
}

initApp();
