const ignoreWebhookControl = require('./ignoreWebhookControl');

module.exports = migration => {
  const {
    webhookTypes,
    detectedInverseRelationships
  } = global.webhook2contentful;

  const ContentTypeTuples = Object.keys(webhookTypes).map(webhookKey => {
    const webhookType = webhookTypes[webhookKey];
    return {
      ContentType: migration.editContentType(webhookKey),
      webhookKey
    };
  });

  ContentTypeTuples.forEach(({ ContentType, webhookKey }) => {
    webhookTypes[webhookKey].controls.forEach(control => {
      if (
        ignoreWebhookControl(
          control,
          detectedInverseRelationships[webhookKey] || []
        )
      )
        return;

      if (control.required) {
        ContentType.editField(control.name).required(control.required);
      }
    });
  });
};
