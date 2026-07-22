const reminderList = document.getElementById('reminderList');
const addReminderButton = document.getElementById('addReminderButton');
const dialogOverlay = document.getElementById('dialogOverlay');
const reminderText = document.getElementById('reminderText');
const reminderDatetime = document.getElementById('reminderDatetime');
const cancelButton = document.getElementById('cancelButton');
const saveButton = document.getElementById('saveButton');

const STORAGE_KEY = 'erinnerungsapp_reminders';
let editIndex = null;

// Debug: log element references to ensure they exist when script runs
console.log('Elements:', {
  reminderList: !!reminderList,
  addReminderButton: !!addReminderButton,
  dialogOverlay: !!dialogOverlay,
  reminderText: !!reminderText,
  reminderDatetime: !!reminderDatetime,
  cancelButton: !!cancelButton,
  saveButton: !!saveButton
});

function loadReminders() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveReminders(reminders) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
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

function renderReminders() {
  const reminders = loadReminders();
  if (reminders.length === 0) {
    reminderList.innerHTML = '<p class="empty-state">Wilkommen bei Erinnerungen!</p>';
    return;
  }

  reminderList.innerHTML = reminders.map((reminder, index) => {
    return `
      <article class="reminder-card">
        <div class="reminder-header">
          <h2>${reminder.text}</h2>
          <div class="reminder-actions">
            <button class="edit-button" data-index="${index}">Bearbeiten</button>
            <button class="delete-button" data-index="${index}">Löschen</button>
          </div>
        </div>
        <p>${formatDateTime(reminder.datetime)}</p>
      </article>
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
    dialogOverlay.style.display = '';
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
    dialogOverlay.style.display = '';
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

function saveCurrentReminder() {
  const text = reminderText.value.trim();
  const datetime = reminderDatetime.value;

  if (!text) {
    return;
  }

  const reminders = loadReminders();
  const reminder = { text, datetime: datetime || null };

  if (editIndex !== null) {
    reminders[editIndex] = reminder;
  } else {
    reminders.push(reminder);
  }

  saveReminders(reminders);
  renderReminders();
  closeDialog();
}

if (addReminderButton) addReminderButton.addEventListener('click', () => openDialog());
if (cancelButton) {
  cancelButton.addEventListener('click', closeDialog);
} else {
  console.warn('cancelButton not found — click listener not attached');
}
if (saveButton) saveButton.addEventListener('click', saveCurrentReminder);

// Dialog wird ausschließlich über den Abbrechen-Button geschlossen.
// Kein Click-away-Handling, kein Escape-Key: App-typisches Verhalten.

// Ensure dialog is hidden on startup so app opens on the list view
if (dialogOverlay) {
  dialogOverlay.hidden = true;
  dialogOverlay.style.display = '';
}

renderReminders();
