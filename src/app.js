// 1 Block Elemente aus dem HTML holen
const reminderList = document.getElementById('reminderList');
const addReminderButton = document.getElementById('addReminderButton');
const dialogOverlay = document.getElementById('dialogOverlay');
const reminderText = document.getElementById('reminderText');
const reminderDatetime = document.getElementById('reminderDatetime');
const cancelButton = document.getElementById('cancelButton');
const saveButton = document.getElementById('saveButton');

const STORAGE_KEY = 'erinnerungsapp_reminders';
const REMINDER_ACTION_TYPE_ID = 'reminder_actions';
const COMPLETE_REMINDER_ACTION_ID = 'complete_reminder';
let editIndex = null;

// 2 Block Dattenhaltung im local storage des Browsers
function getLocalNotifications() {
  return window.Capacitor?.Plugins?.LocalNotifications;
}

function createNotificationId() {
  return Math.floor(Math.random() * 2147483646) + 1;
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
}

async function scheduleReminderNotification(reminder) {
  if (!reminder.datetime) {
    await cancelReminderNotification(reminder.notificationId);
    return;
  }

  const scheduledAt = new Date(reminder.datetime);
  if (Number.isNaN(scheduledAt.getTime())) {
    console.warn('Could not schedule reminder: invalid date:', reminder.datetime);
    return;
  }

  const localNotifications = getLocalNotifications();
  if (!localNotifications) {
    return;
  }

  try {
    let permission = await localNotifications.checkPermissions();
    if (permission.display === 'prompt') {
      permission = await localNotifications.requestPermissions();
    }

    if (permission.display !== 'granted') {
      console.warn('Notification permission was not granted.');
      return;
    }

    // Replace any previously scheduled notification with the same id.
    await cancelReminderNotification(reminder.notificationId);

    await localNotifications.schedule({
      notifications: [{
        id: reminder.notificationId,
        title: 'Erinnerung',
        body: reminder.text,
        actionTypeId: REMINDER_ACTION_TYPE_ID,
        schedule: { at: scheduledAt }
      }]
    });
  } catch (error) {
    // The reminder remains saved if scheduling is unavailable or rejected.
    console.warn('Could not schedule local notification:', error);
  }
}

async function registerNotificationActions() {
  const localNotifications = getLocalNotifications();
  if (!localNotifications) {
    return;
  }

  try {
    await localNotifications.registerActionTypes({
      types: [{
        id: REMINDER_ACTION_TYPE_ID,
        actions: [{ id: COMPLETE_REMINDER_ACTION_ID, title: 'Erledigt' }]
      }]
    });

    await localNotifications.addListener(
      'localNotificationActionPerformed',
      async ({ actionId, notification }) => {
        if (actionId !== COMPLETE_REMINDER_ACTION_ID) {
          return;
        }

        const reminders = loadReminders();
        const reminderIndex = reminders.findIndex(
          reminder => reminder.notificationId === notification.id
        );
        if (reminderIndex === -1) {
          return;
        }

        const [removed] = reminders.splice(reminderIndex, 1);
        saveReminders(reminders);
        await cancelReminderNotification(removed?.notificationId ?? notification.id);
        renderReminders();
      }
    );
  } catch (error) {
    console.warn('Could not register notification actions:', error);
  }
}

// 3 Block Erinnerungen aufrufen
function loadReminders() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item) => item && typeof item === 'object' && typeof item.text === 'string');
  } catch (error) {
    console.warn('Could not load reminders:', error);
    return [];
  }
}

function saveReminders(reminders) {
  const safeReminders = Array.isArray(reminders) ? reminders : [];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(safeReminders));
}

// 4 Block Datenformatierung
function formatDateTime(value) {
  if (!value) {
    return 'Kein Datum';
  }

  const date = new Date(value);
  return date.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
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

  if (typeof element.value === 'string' && element.value.length > 0) {
    return element.value;
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

  return element.value ?? '';
}

function bindButtonClick(button, handler) {
  if (!button) {
    return;
  }

  const handleClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    handler(event);
  };

  button.addEventListener('click', handleClick);

  const nativeButton = button.shadowRoot?.querySelector('button');
  if (nativeButton) {
    nativeButton.addEventListener('click', handleClick);
  }
}

// 5 Block Erinnerungen anzeigen, UI aufbauen
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

function openDialog(reminder = null, index = null) {
  if (dialogOverlay) {
    dialogOverlay.hidden = false;
    dialogOverlay.style.display = 'grid';
  }

  const dialogTitle = dialogOverlay?.querySelector('ion-card-title');

  if (reminder) {
    reminderText.value = reminder.text;
    reminderDatetime.value = reminder.datetime || '';
    editIndex = index;
    saveButton.textContent = 'Aktualisieren';
    if (dialogTitle) {
      dialogTitle.textContent = 'Erinnerung bearbeiten';
    }
  } else {
    reminderText.value = '';
    reminderDatetime.value = '';
    editIndex = null;
    saveButton.textContent = 'Speichern';
    if (dialogTitle) {
      dialogTitle.textContent = 'Neue Erinnerung';
    }
  }
}

function closeDialog() {
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

  appShortcuts.addListener('click', ({ id }) => {
    if (id === 'newReminder') {
      openDialog();
    }
  }).catch(error => {
    console.warn('Could not register app shortcut listener:', error);
  });
}

async function showMessage(message) {
  try {
    const toast = document.createElement('ion-toast');
    toast.message = message;
    toast.duration = 2500;
    toast.color = 'danger';
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

  saveReminders(reminders);
  await cancelReminderNotification(removed.notificationId);
  renderReminders();
}

// 6 Block APp-start und Aufbau
async function saveCurrentReminder() {
  const text = (await getFieldValue(reminderText)).trim();
  const datetime = await getFieldValue(reminderDatetime);

  if (!text) {
    await showMessage('Bitte Text eingeben');
    return;
  }

  const reminders = loadReminders();
  const previousReminder = editIndex !== null ? reminders[editIndex] : null;
  const reminder = {
    text,
    datetime: datetime || null,
    notificationId: previousReminder?.notificationId ?? createNotificationId()
  };

  if (editIndex !== null) {
    reminders[editIndex] = reminder;
  } else {
    reminders.push(reminder);
  }

  saveReminders(reminders);
  await scheduleReminderNotification(reminder);
  closeDialog();
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

if (dialogOverlay) {
  dialogOverlay.hidden = true;
  dialogOverlay.style.display = 'none';
}

registerAppShortcutListener();
registerNotificationActions();
renderReminders();
