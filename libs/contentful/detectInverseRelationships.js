module.exports = webhookTypes => {
  return Object.keys(webhookTypes).reduce((acc, webhookKey) => {
    const webhookType = webhookTypes[webhookKey];
    const ignored = webhookType.controls.reduce((acc, control) => {
      if (control.controlType !== 'relation') return acc;
      if (control.meta.reverseName.length === control.name.length) {
        throw Error(
          `reverseName (${
            control.meta.reverseName.length
          }) same length as control name (${control.name})`
        );
      }
      if (control.meta.reverseName.length > control.name.length) return acc;
      return [...acc, control.name];
    }, []);
    acc[webhookKey] = ignored;
    return acc;
  }, {});
};
