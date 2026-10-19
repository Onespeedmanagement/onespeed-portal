/**
 * OneSpeed Portal — POS email pickup and morning summary.
 * Runs in the Google account that receives posreports@onespeedmanagement.com mail.
 *
 * Script properties (Project Settings → Script properties):
 *   PORTAL_URL     https://onespeed-portal.vercel.app
 *   PORTAL_SECRET  the same long random value as POS_INBOUND_SECRET in Vercel
 *   ADMIN_EMAILS   ujash@onespeedmanagement.com,vrajesh@onespeedmanagement.com
 *
 * Triggers (Triggers → Add trigger):
 *   processInbox        Time-driven, every hour
 *   sendMorningSummary  Time-driven, day timer, 7am to 8am
 *   checkMissingAtNoon  Time-driven, day timer, 12pm to 1pm
 * Contract reminders go out with the morning summary (sendMorningSummary calls sendContractReminders).
 */

const LABEL = 'portal-processed';
const QUERY = 'to:posreports@onespeedmanagement.com has:attachment filename:pdf newer_than:14d -label:' + LABEL;

function props_() {
  const p = PropertiesService.getScriptProperties();
  return { url: p.getProperty('PORTAL_URL'), secret: p.getProperty('PORTAL_SECRET'), admins: p.getProperty('ADMIN_EMAILS') };
}

function processInbox() {
  const cfg = props_();
  const label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  const threads = GmailApp.search(QUERY, 0, 50);
  threads.forEach(function (thread) {
    let allOk = true;
    thread.getMessages().forEach(function (msg) {
      msg.getAttachments().forEach(function (att) {
        if (!/\.pdf$/i.test(att.getName())) return;
        const res = UrlFetchApp.fetch(cfg.url + '/api/pos/inbound', {
          method: 'post', contentType: 'application/json', muteHttpExceptions: true,
          headers: { 'x-portal-secret': cfg.secret },
          payload: JSON.stringify({ filename: att.getName(), data: Utilities.base64Encode(att.getBytes()) }),
        });
        const code = res.getResponseCode();
        Logger.log(att.getName() + ' → ' + code + ' ' + res.getContentText());
        if (code >= 500 || code === 401) allOk = false;   // retry next hour
      });
    });
    if (allOk) thread.addLabel(label);
  });
}

function getSummary_() {
  const cfg = props_();
  const res = UrlFetchApp.fetch(cfg.url + '/api/summary', { headers: { 'x-portal-secret': cfg.secret }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('Summary failed: ' + res.getResponseCode());
  return JSON.parse(res.getContentText());
}

function sendMorningSummary() {
  processInbox();                       // pick up anything that just arrived
  const s = getSummary_();
  MailApp.sendEmail({ to: props_().admins, subject: s.subject, htmlBody: s.html, name: 'OneSpeed Portal' });
  sendContractReminders();
}

// Contract renewal reminders (30 and 7 days before each notice deadline)
function sendContractReminders() {
  const cfg = props_();
  const res = UrlFetchApp.fetch(cfg.url + '/api/reminders', { headers: { 'x-portal-secret': cfg.secret }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) { Logger.log('Reminders failed: ' + res.getResponseCode()); return; }
  JSON.parse(res.getContentText()).emails.forEach(function (e) {
    MailApp.sendEmail({ to: e.to, subject: e.subject, htmlBody: e.html, name: 'OneSpeed Portal' });
  });
}

function checkMissingAtNoon() {
  processInbox();
  const s = getSummary_();
  if (s.missing && s.missing.length) {
    MailApp.sendEmail({ to: props_().admins, subject: '⚠ Still missing POS report: ' + s.missing.join(', '),
      htmlBody: s.html + '<p>Call the POS vendor, or upload the report on the portal\'s Upload page.</p>', name: 'OneSpeed Portal' });
  }
}
