module.exports = (control, detectedInverseRelationships) => {
  if (detectedInverseRelationships.includes(control.name)) {
    console.warn(
      `W2C ~~~> Ignoring relationship ${
        control.name
      } as it appears to be inverse`
    );
    return true;
  }

  /* Ignore Timestamps & Extra Junk - plus slugs are generated at build time by webhook */
  if (
    [
      'slug',
      'create_date',
      'last_updated',
      'publish_date',
      'preview_url'
    ].includes(control.name)
  )
    return true;

  /* Ignore "instruction" blocks */
  if (control.controlType === 'instruction') {
    console.warn(
      `webhook2contentful ~~~> Ignoring instruction ${
        control.name
      } as contentful instructions belong on the field rather than seperate.`,
      control.help
    );
    return true;
  }

  if (control.controlType === 'embedly') {
    console.warn(
      `webhook2contentful ~~~> Treating ${
        control.name
      } as a string, as Contentful doesn't support embedly.`
    );
    return true;
  }

  return false;
};
