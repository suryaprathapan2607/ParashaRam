# Parasaram
This repo is created to host the webpage of the Parasaram an aestrology consultant

## Booking: WhatsApp for now (online booking dormant)
All "Book" buttons open WhatsApp chat with +91 94866 25264 (`WHATSAPP_BOOKING_URL` in `script.js`).

The online "Book Your Consultation" form (`appointment.html` + n8n workflow with Google Calendar
availability check, Meet link, sheet log and confirmation mail) is kept dormant, not deleted:

- branch `dormant/book-appointment` and tag `booking-feature-v1` hold the last working version.
- To bring it back: `git checkout booking-feature-v1 -- appointment.html script.js index.html`,
  then point the appointment endpoint at a live backend before publishing.
