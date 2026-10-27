/** Gmail contextual entry point. Google supplies the current-message capability. */
function onGmailMessage(event) {
  if (!event.gmail || !/^[A-Za-z0-9_-]+$/.test(event.gmail.messageId)) throw new Error('Open a Gmail message first.');
  GmailApp.setCurrentMessageAccessToken(event.gmail.accessToken);
  var message = GmailApp.getMessageById(event.gmail.messageId);
  var origin = PropertiesService.getScriptProperties().getProperty('INKWELL_ORIGIN');
  if (!/^(https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?|http:\/\/127\.0\.0\.1:[0-9]{1,5})$/.test(origin || '')) throw new Error('Configure the Inkwell origin first.');
  var section = CardService.newCardSection();
  var escape = function(value) { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  section.addWidget(CardService.newTextParagraph().setText('From: ' + escape(message.getFrom()) + '<br>To: ' + escape(message.getTo()) + '<br>Cc: ' + escape(message.getCc())));
  var attachments = message.getAttachments({includeInlineImages:false,includeAttachments:true}).filter(function(file) { return file.getContentType() === 'application/pdf'; });
  attachments.forEach(function(file) { section.addWidget(CardService.newTextParagraph().setText(escape(file.getName()))); });
  if (attachments.length) {
    var base = origin + '/app?gmailMessage=' + encodeURIComponent(event.gmail.messageId);
    section.addWidget(CardService.newTextButton().setText('Prepare in Inkwell').setOpenLink(CardService.newOpenLink().setUrl(base + '&gmailAction=send')));
    section.addWidget(CardService.newTextButton().setText('Sign it myself').setOpenLink(CardService.newOpenLink().setUrl(base + '&gmailAction=self')));
  } else section.addWidget(CardService.newTextParagraph().setText('This message has no attached PDF.'));
  return CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle('Inkwell')).addSection(section).build();
}
