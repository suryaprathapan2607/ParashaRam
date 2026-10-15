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

// Mobile intro — only present on index.html. The large hero logo shrinks and
// fades as the page scrolls; once it passes under the header, the header gets
// its own logo and background back (CSS keys off body.intro-active).
const heroIntro = document.getElementById('heroIntro');
const heroIntroMark = document.getElementById('heroIntroMark');
const siteHeader = document.querySelector('.site-header');

if (heroIntro && heroIntroMark && siteHeader) {
  const mobileQuery = window.matchMedia('(max-width: 640px)');
  let ticking = false;

  function updateIntro() {
    ticking = false;

    if (!mobileQuery.matches) {
      document.body.classList.remove('intro-active');
      heroIntroMark.style.transform = '';
      heroIntroMark.style.opacity = '';
      return;
    }

    document.documentElement.style.setProperty('--header-h', `${siteHeader.offsetHeight}px`);

    const fadeDistance = heroIntroMark.offsetHeight || 1;
    const progress = Math.min(Math.max(window.scrollY / fadeDistance, 0), 1);
    heroIntroMark.style.transform = `scale(${1 - progress * 0.4})`;
    heroIntroMark.style.opacity = String(1 - progress);

    const logoBottom = heroIntroMark.getBoundingClientRect().bottom;
    const headerBottom = siteHeader.getBoundingClientRect().bottom;
    document.body.classList.toggle('intro-active', logoBottom > headerBottom && progress < 0.85);
  }

  function requestIntroUpdate() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(updateIntro);
    }
  }

  window.addEventListener('scroll', requestIntroUpdate, { passive: true });
  window.addEventListener('resize', requestIntroUpdate);
  // Older Safari (iOS 13 and below) only supports the deprecated addListener
  if (mobileQuery.addEventListener) {
    mobileQuery.addEventListener('change', requestIntroUpdate);
  } else if (mobileQuery.addListener) {
    mobileQuery.addListener(requestIntroUpdate);
  }
  updateIntro();
}

// Word counter for the doubt textarea (500 word max) — only present on index.html
const doubtMessage = document.getElementById('doubtMessage');
const wordCount = document.getElementById('wordCount');
const WORD_LIMIT = 500;

function countWords(text) {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

if (doubtMessage && wordCount) {
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
}

// Appointment scheduling constraints: Monday–Friday, 10:00 AM–5:00 PM —
// only present on appointment.html
const apptDateInput = document.getElementById('apptDate');
const apptDateError = document.getElementById('apptDateError');
const apptTimeInput = document.getElementById('apptTime');
const apptTimeError = document.getElementById('apptTimeError');
const BUSINESS_START = '10:00';
const BUSINESS_END = '17:00';

function checkApptDate() {
  if (!apptDateInput.value) return true;
  const day = new Date(`${apptDateInput.value}T00:00:00`).getDay(); // 0=Sun..6=Sat
  const isWeekday = day >= 1 && day <= 5;
  apptDateError.textContent = isWeekday ? '' : 'Appointments are only available Monday to Friday.';
  return isWeekday;
}

function checkApptTime() {
  if (!apptTimeInput.value) return true;
  const inRange = apptTimeInput.value >= BUSINESS_START && apptTimeInput.value <= BUSINESS_END;
  apptTimeError.textContent = inRange ? '' : 'Appointments are only available between 10:00 AM and 5:00 PM.';
  return inRange;
}

if (apptDateInput && apptDateError) {
  apptDateInput.addEventListener('change', checkApptDate);
}
if (apptTimeInput && apptTimeError) {
  apptTimeInput.addEventListener('change', checkApptTime);
}

function validateAppointmentSchedule() {
  const dateOk = checkApptDate();
  const timeOk = checkApptTime();
  return dateOk && timeOk;
}

// ===== n8n webhook configuration =====
// Replace these with your n8n workflow's "Production URL" (Webhook node).
// Each workflow should accept a POST with a JSON body and respond 200 on success.
// NOTE: appointment webhook is TEMPORARILY set to its /webhook-test/ URL so
// the updated field set (including the new email field) can be captured in
// n8n. Switch back to the /webhook/ production URL and re-publish before
// this goes live.
const N8N_WEBHOOKS = {
  doubt: 'https://suryaprathapan2607.n8n-wsk.com/webhook/eea2d3f9-3701-4b63-a316-46462ea63e30',
  appointment: 'https://suryaprathapan2607.n8n-wsk.com/webhook/fb9e6f8e-df9d-4a0a-bd6a-739a0af6f0f9',
};

function isWebhookConfigured(url) {
  return typeof url === 'string' && !url.includes('your-n8n-instance');
}

async function submitToWebhook(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Webhook responded with status ${response.status}`);
  }
  try {
    return await response.json();
  } catch (err) {
    return null; // response wasn't JSON — that's fine, just no extra data
  }
}

// buildPayload: (formData) => object to send
// successMessage: shown when the webhook succeeds and gives no special status
// getResultMessage: optional (responseData) => custom message to show instead
//   of successMessage, based on what the n8n workflow sent back (e.g. a
//   { status: "unavailable" } response for a taken appointment slot)
// onReset: optional () => extra cleanup after a successful submit (e.g.
//   resetting the doubt form's word counter)
// validate: optional () => boolean — return false to block submission
//   (the validator is responsible for showing its own error messages)
// onSuccess: optional (responseData) => extra DOM updates after a successful
//   submit (e.g. showing a "Book Appointment" link when the workflow asks for it)
function handleFormSubmit(formId, noteId, { webhookUrl, buildPayload, successMessage, getResultMessage, onReset, validate, onSuccess }) {
  const form = document.getElementById(formId);
  const note = document.getElementById(noteId);
  if (!form || !note) return; // this form isn't on the current page

  const submitBtn = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (validate && !validate()) return;

    const formData = new FormData(form);
    const payload = buildPayload(formData);

    if (!isWebhookConfigured(webhookUrl)) {
      console.warn(`[n8n] No webhook configured for #${formId} — set N8N_WEBHOOKS in script.js. Payload:`, payload);
      note.textContent = successMessage;
      form.reset();
      if (onReset) onReset();
      return;
    }

    const originalBtnText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';
    note.textContent = '';

    try {
      const responseData = await submitToWebhook(webhookUrl, payload);
      const customMessage = getResultMessage && getResultMessage(responseData);
      note.textContent = customMessage || successMessage;
      form.reset();
      if (onReset) onReset();
      if (onSuccess) onSuccess(responseData);
    } catch (err) {
      console.error(`[n8n] Submission failed for #${formId}:`, err);
      note.textContent = 'Something went wrong sending this — please try again, or reach out by phone/email.';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
    }
  });
}

const doubtFormActions = document.getElementById('doubtFormActions');

handleFormSubmit('doubtForm', 'doubtFormNote', {
  webhookUrl: N8N_WEBHOOKS.doubt,
  successMessage: 'Thank you. Your question has been received and will be reviewed personally.',
  onReset: () => { wordCount.textContent = '0'; },
  getResultMessage: (data) => (data && data.message) || null,
  onSuccess: (data) => {
    if (!doubtFormActions) return;
    doubtFormActions.innerHTML = '';
    if (data && data.showBookingLink) {
      const link = document.createElement('a');
      link.href = 'appointment.html';
      link.className = 'btn btn-primary';
      link.textContent = 'Book Appointment';
      doubtFormActions.appendChild(link);
    }
  },
  buildPayload: (formData) => ({
    type: 'doubt',
    name: formData.get('name'),
    contact: formData.get('contact'),
    dateOfBirth: formData.get('dateOfBirth'),
    timeOfBirth: formData.get('timeOfBirth'),
    placeOfBirth: formData.get('placeOfBirth'),
    message: formData.get('message'),
    wordCount: countWords(formData.get('message') || ''),
    submittedAt: new Date().toISOString(),
    source: window.location.href,
  }),
});

handleFormSubmit('appointmentForm', 'apptFormNote', {
  webhookUrl: N8N_WEBHOOKS.appointment,
  successMessage: 'Thank you. Your appointment request has been received — we will confirm your slot shortly.',
  validate: validateAppointmentSchedule,
  getResultMessage: (data) => {
    // Show whatever message the n8n workflow sends back (from either the
    // "Booking Confirmed" or "Please Choose a Different Slot" Respond node),
    // falling back to a generic message only if none was provided.
    if (data && data.message) {
      return data.message;
    }
    if (data && data.status === 'unavailable') {
      return 'Sorry, that slot is already booked. Please choose a different date or time.';
    }
    return null;
  },
  buildPayload: (formData) => ({
    type: 'appointment',
    name: formData.get('name'),
    phone: formData.get('phone'),
    email: formData.get('email'),
    dateOfBirth: formData.get('dateOfBirth'),
    timeOfBirth: formData.get('timeOfBirth'),
    cityOfBirth: formData.get('cityOfBirth'),
    stateOfBirth: formData.get('stateOfBirth'),
    countryOfBirth: formData.get('countryOfBirth'),
    date: formData.get('date'),
    time: formData.get('time'),
    mode: formData.get('mode'),
    otherDetails: formData.get('otherDetails'),
    submittedAt: new Date().toISOString(),
    source: window.location.href,
  }),
});

document.getElementById('year').textContent = new Date().getFullYear();
