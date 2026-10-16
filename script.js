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

// Mobile intro — only present on index.html. While the page is at the top, the
// header logo is hidden and the large hero logo stands in for it. Scrolling
// moves and shrinks the large logo into the header logo's exact spot; once it
// lands, the header logo takes over (CSS keys off body.intro-active).
const heroIntro = document.getElementById('heroIntro');
const heroIntroMark = document.getElementById('heroIntroMark');
const siteHeader = document.querySelector('.site-header');
const headerLogo = document.querySelector('.site-header .brand-logo-full');

if (heroIntro && heroIntroMark && siteHeader && headerLogo) {
  const mobileQuery = window.matchMedia('(max-width: 640px)');
  let ticking = false;
  let geometry = null;

  function resetIntroMark() {
    heroIntroMark.style.transform = '';
    heroIntroMark.style.visibility = '';
  }

  // Untransformed position of the large logo (page coordinates) and the
  // header logo it flies to (viewport coordinates — the header is sticky).
  function measureIntro() {
    resetIntroMark();
    document.documentElement.style.setProperty('--header-h', `${siteHeader.offsetHeight}px`);
    const from = heroIntroMark.getBoundingClientRect();
    const to = headerLogo.getBoundingClientRect();
    geometry = {
      left: from.left,
      top: from.top + window.scrollY,
      width: from.width || 1,
      targetLeft: to.left,
      targetTop: to.top,
      targetWidth: to.width,
    };
  }

  function updateIntro() {
    ticking = false;

    if (!mobileQuery.matches) {
      document.body.classList.remove('intro-active');
      resetIntroMark();
      geometry = null;
      return;
    }

    if (!geometry) measureIntro();
    const g = geometry;
    const y = window.scrollY;

    // The logo rides up with the page while shrinking and sliding left, and
    // reaches the header spot exactly when its top meets the header logo's top
    const distance = Math.max(g.top - g.targetTop, 1);
    const progress = Math.min(Math.max(y / distance, 0), 1);
    const scale = 1 + (g.targetWidth / g.width - 1) * progress;
    const dx = (g.targetLeft - g.left) * progress;
    const dy = (g.targetTop - g.top) * progress + y;

    heroIntroMark.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;

    const landed = progress >= 1;
    heroIntroMark.style.visibility = landed ? 'hidden' : '';
    document.body.classList.toggle('intro-active', !landed);
  }

  function requestIntroUpdate() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(updateIntro);
    }
  }

  function remeasureIntro() {
    geometry = null;
    requestIntroUpdate();
  }

  window.addEventListener('scroll', requestIntroUpdate, { passive: true });
  window.addEventListener('resize', remeasureIntro);
  window.addEventListener('load', remeasureIntro);
  // Older Safari (iOS 13 and below) only supports the deprecated addListener
  if (mobileQuery.addEventListener) {
    mobileQuery.addEventListener('change', remeasureIntro);
  } else if (mobileQuery.addListener) {
    mobileQuery.addListener(remeasureIntro);
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

// ===== Form endpoints =====
// The book-appointment form is dormant (see branch dormant/book-appointment);
// consultations are booked over WhatsApp for now.
const N8N_WEBHOOKS = {
  doubt: 'https://suryaparasaram2607.pythonanywhere.com/api/doubt',
};

const WHATSAPP_BOOKING_URL = 'https://wa.me/919486625264?text=Hello%2C%20I%20would%20like%20to%20book%20a%20consultation%20with%20Ram%20Narayanan%20Rao.';

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
      link.href = WHATSAPP_BOOKING_URL;
      link.target = '_blank';
      link.rel = 'noopener';
      link.className = 'btn btn-primary';
      link.textContent = 'Book on WhatsApp';
      doubtFormActions.appendChild(link);
    }
  },
  buildPayload: (formData) => ({
    type: 'doubt',
    name: formData.get('name'),
    contact: formData.get('contact'),
    phone: formData.get('phone'),
    dateOfBirth: formData.get('dateOfBirth'),
    timeOfBirth: formData.get('timeOfBirth'),
    placeOfBirth: formData.get('placeOfBirth'),
    message: formData.get('message'),
    website: formData.get('website'),
    wordCount: countWords(formData.get('message') || ''),
    submittedAt: new Date().toISOString(),
    source: window.location.href,
  }),
});

document.getElementById('year').textContent = new Date().getFullYear();
