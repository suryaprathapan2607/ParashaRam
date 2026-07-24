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

// ===== n8n webhook configuration =====
// Replace these with your n8n workflow's "Production URL" (Webhook node).
// Each workflow should accept a POST with a JSON body and respond 200 on success.
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
function handleFormSubmit(formId, noteId, { webhookUrl, buildPayload, successMessage, getResultMessage }) {
  const form = document.getElementById(formId);
  const note = document.getElementById(noteId);
  const submitBtn = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(form);
    const payload = buildPayload(formData);

    if (!isWebhookConfigured(webhookUrl)) {
      console.warn(`[n8n] No webhook configured for #${formId} — set N8N_WEBHOOKS in script.js. Payload:`, payload);
      note.textContent = successMessage;
      form.reset();
      wordCount.textContent = '0';
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
      wordCount.textContent = '0';
    } catch (err) {
      console.error(`[n8n] Submission failed for #${formId}:`, err);
      note.textContent = 'Something went wrong sending this — please try again, or reach out by phone/email.';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
    }
  });
}

handleFormSubmit('doubtForm', 'doubtFormNote', {
  webhookUrl: N8N_WEBHOOKS.doubt,
  successMessage: 'Thank you. Your question has been received and will be reviewed personally.',
  buildPayload: (formData) => ({
    type: 'doubt',
    name: formData.get('name'),
    contact: formData.get('contact'),
    message: formData.get('message'),
    wordCount: countWords(formData.get('message') || ''),
    submittedAt: new Date().toISOString(),
    source: window.location.href,
  }),
});

handleFormSubmit('appointmentForm', 'apptFormNote', {
  webhookUrl: N8N_WEBHOOKS.appointment,
  successMessage: 'Thank you. Your appointment request has been received — we will confirm your slot shortly.',
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
    date: formData.get('date'),
    time: formData.get('time'),
    mode: formData.get('mode'),
    notes: formData.get('notes'),
    submittedAt: new Date().toISOString(),
    source: window.location.href,
  }),
});

document.getElementById('year').textContent = new Date().getFullYear();
