// Mobile nav toggle
const navToggle = document.getElementById('navToggle');
const siteNav = document.getElementById('siteNav');

navToggle.addEventListener('click', () => {
  const isOpen = siteNav.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', isOpen);
});

siteNav.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    siteNav.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  });
});

// Word counter for the doubt textarea (500 word max)
const doubtMessage = document.getElementById('doubtMessage');
const wordCount = document.getElementById('wordCount');
const WORD_LIMIT = 500;

function countWords(text) {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

doubtMessage.addEventListener('input', () => {
  const words = doubtMessage.value.trim() === '' ? [] : doubtMessage.value.trim().split(/\s+/);
  let count = words.length;

  if (count > WORD_LIMIT) {
    doubtMessage.value = words.slice(0, WORD_LIMIT).join(' ');
    count = WORD_LIMIT;
  }

  wordCount.textContent = count;
  wordCount.parentElement.classList.toggle('limit-reached', count >= WORD_LIMIT);
});

// Front-end only form handling (no backend wired up yet)
function handleFormSubmit(formId, noteId, message) {
  const form = document.getElementById(formId);
  const note = document.getElementById(noteId);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    note.textContent = message;
    form.reset();
    wordCount.textContent = '0';
  });
}

handleFormSubmit('doubtForm', 'doubtFormNote', 'Thank you. Your question has been received and will be reviewed personally.');
handleFormSubmit('appointmentForm', 'apptFormNote', 'Thank you. Your appointment request has been received — we will confirm your slot shortly.');

document.getElementById('year').textContent = new Date().getFullYear();
