const reminderList = document.getElementById('reminderList');
const addReminderButton = document.getElementById('addReminderButton');
const dialogOverlay = document.getElementById('dialogOverlay');
const reminderText = document.getElementById('reminderText');
const reminderDatetime = document.getElementById('reminderDatetime');
const cancelButton = document.getElementById('cancelButton');
const saveButton = document.getElementById('saveButton');

const STORAGE_KEY = 'erinnerungsapp_reminders';
let editIndex = null;

function getLocalNotifications() {
  return window.Capacitor?.Plugins?.LocalNotifications;
}

function createNotificationId() {
  // Android requires notification IDs to fit into a signed 32-bit integer.
  return Math.floor(Math.random() * 2147483646) + 1;
}

async function scheduleReminderNotification(reminder) {
  if (!reminder.datetime) {
    return;
  }

  const scheduledAt = new Date(reminder.datetime);
  if (Number.isNaN(scheduledAt.getTime())) {
    console.warn('Could not schedule reminder: invalid date:', reminder.datetime);
    return;
  }

  const localNotifications = getLocalNotifications();
  if (!localNotifications) {
    // The browser preview has no Capacitor native bridge.
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

    await localNotifications.schedule({
      notifications: [{
        id: reminder.notificationId,
        title: 'Erinnerung',
        body: reminder.text,
        schedule: { at: scheduledAt }
      }]
    });
  } catch (error) {
    // Saving the reminder must still work if scheduling is unavailable or denied.
    console.warn('Could not schedule local notification:', error);
  }
}

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

  if (reminder) {
    reminderText.value = reminder.text;
    reminderDatetime.value = reminder.datetime || '';
    editIndex = index;
    saveButton.textContent = 'Aktualisieren';
  } else {
    reminderText.value = '';
    reminderDatetime.value = '';
    editIndex = null;
    saveButton.textContent = 'Speichern';
  }
}

function closeDialog() {
  if (dialogOverlay) {
    dialogOverlay.hidden = true;
    dialogOverlay.style.display = 'none';
  }
}

function deleteReminder(index) {
  const reminders = loadReminders();
  reminders.splice(index, 1);
  saveReminders(reminders);
  renderReminders();
}

function editReminder(index) {
  const reminders = loadReminders();
  const reminder = reminders[index];
  if (!reminder) return;

  openDialog(reminder, index);
}

async function saveCurrentReminder() {
  const text = (await getFieldValue(reminderText)).trim();
  const datetime = await getFieldValue(reminderDatetime);

  if (!text) {
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

renderReminders();
