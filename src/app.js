const reminderList = document.getElementById('reminderList');
const addReminderButton = document.getElementById('addReminderButton');
const dialogOverlay = document.getElementById('dialogOverlay');
const reminderText = document.getElementById('reminderText');
const reminderDatetime = document.getElementById('reminderDatetime');
const cancelButton = document.getElementById('cancelButton');
const saveButton = document.getElementById('saveButton');

const STORAGE_KEY = 'erinnerungsapp_reminders';

function loadReminders() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveReminders(reminders) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
}

function formatDateTime(value) {
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
  reminderList.innerHTML = reminders.map((reminder, index) => {
    return `
      <article class="reminder-card">
        <h2>${reminder.text}</h2>
        <p>${formatDateTime(reminder.datetime)}</p>
      </article>
    `;
  }).join('');
}

function openDialog() {
  dialogOverlay.hidden = false;
  reminderText.value = '';
  reminderDatetime.value = '';
}

function closeDialog() {
  dialogOverlay.hidden = true;
}

addReminderButton.addEventListener('click', openDialog);
cancelButton.addEventListener('click', closeDialog);
saveButton.addEventListener('click', () => {
  const text = reminderText.value.trim();
  const datetime = reminderDatetime.value;
  if (!text || !datetime) {
    return;
  }

  const reminders = loadReminders();
  reminders.push({ text, datetime });
  saveReminders(reminders);
  renderReminders();
  closeDialog();
});

dialogOverlay.addEventListener('click', (event) => {
  if (event.target === dialogOverlay) closeDialog();
});

renderReminders();
