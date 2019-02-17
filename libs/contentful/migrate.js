const Constants = require('./constants');
const ignoreWebhookControl = require('./ignoreWebhookControl');

const { Types, Widgets, WebhookFieldMappings, WebhookSiteSettingsType } = Constants;

const applyDisplayField = (ContentType, fieldNames) => {
  if (fieldNames.includes('name')) return ContentType.displayField('name');
  if (fieldNames.includes('title')) return ContentType.displayField('title');
  if (fieldNames.includes('label')) return ContentType.displayField('label');
  return;
}

const TAKEN_GRIDITEM_SUBTYPES = [];

const buildWebhookControlForContentType = (migration, ContentType, control, detectedInverseRelationships) => {
  if (ignoreWebhookControl(control, detectedInverseRelationships)) return false;

  if (control.controlType === "embedly") {
    console.warn(`webhook2contentful ~~~> Treating ${control.name} as a string, as Contentful doesn't support embedly.`);
  }

  const controlMapping = WebhookFieldMappings[control.controlType];
  if (!controlMapping) {
    console.log(control, control.meta);
    throw new Error(`webhook2contentful ~~~> No mapping for webhook control: ${control.controlType}`);
  }

  let defaultValidations = [];

  /* Pull out Grid Types into subtypes */
  if (control.controlType === 'grid') {
    const subItemType = `${control.name}_subitem`;
    if (TAKEN_GRIDITEM_SUBTYPES.includes(subItemType)) {
      throw new Error("webhook2contentful ~~~> Dang. You've got a couple of different grids (list item types) in your webhook model that have the same key name. Right now, this isn't a scenario we handle, please reach out to @_HHFF on twitter for some ideas");
    }
    const GridSubItemContentType = buildWebhookType(migration, `${control.name}_subitem`, `${control.label} Subitem`);
    control.controls.forEach(control => {
      buildWebhookControlForContentType(migration, GridSubItemContentType, control, []);
    });
    applyDisplayField(GridSubItemContentType, control.controls.map(c => c.name));
    TAKEN_GRIDITEM_SUBTYPES.push(subItemType);
  }

  /* Init the field */
  const Field = ContentType.createField(control.name)
    .name(control.label);

  let type = controlMapping.contentfulType;

  /* Deal with the trippy types */
  if (control.controlType === 'relation') {
    if (control.meta.isSingle) {
      Field.type(Types.LINK).linkType(Types.ENTRY);
      defaultValidations = [...defaultValidations, {
        linkContentType: [control.meta.contentTypeId]
      }];
      ContentType.changeEditorInterface(control.name, Widgets.ENTRY_LINK_EDITOR);
    } else {
      Field.type(Types.ARRAY).items({
        type: Types.LINK,
        linkType: Types.ENTRY,
        validations: [{
          linkContentType: [control.meta.contentTypeId]
        }]
      });
      ContentType.changeEditorInterface(control.name, Widgets.ENTRY_LINKS_EDITOR, {
        bulkEditing: true
      });
    }
  } else if (control.controlType === 'grid') {
    Field.type(Types.ARRAY).items({
      type: Types.LINK,
      linkType: Types.ENTRY,
      validations: [{
        linkContentType: [`${control.name}_subitem`]
      }]
    });
    ContentType.changeEditorInterface(control.name, Widgets.ENTRY_LINKS_EDITOR, {
      bulkEditing: true
    });
  } else if (control.controlType === 'image') {
    Field.type(Types.LINK).linkType(Types.ASSET);
    defaultValidations = [...defaultValidations, {
      linkMimetypeGroup: ['image']
    }];
  } else if (control.controlType === 'file') {
    Field.type(Types.LINK).linkType(Types.ASSET);
  } else if (control.controlType === 'gallery') {
    Field.type(Types.ARRAY).items({
      type: Types.LINK,
      linkType: Types.ASSET,
      validations: [{
        linkMimetypeGroup: ['image']
      }]
    });
    ContentType.changeEditorInterface(control.name, Widgets.ASSET_GALLERY_EDITOR, {
      bulkEditing: true
    });
  } else {
    Field.type(controlMapping.contentfulType);
  }

  // Editors & Extra Validations
  switch(control.controlType) {
    case 'wysiwyg': {
      ContentType.changeEditorInterface(control.name, Widgets.MULTIPLE_LINE);
      break;
    }

    case 'url': {
      ContentType.changeEditorInterface(control.name, Widgets.URL_EDITOR);
      break;
    }

    case 'select': {
      ContentType.changeEditorInterface(control.name, Widgets.DROPDOWN);
      const { options } = control.meta;
      defaultValidations = [...defaultValidations, {
        in: options.map(o => o.value)
      }];
      break;
    }

    case 'radio': {
      ContentType.changeEditorInterface(control.name, Widgets.RADIO);
      const { options } = control.meta;
      defaultValidations = [...defaultValidations, {
        in: options.map(o => o.value)
      }];
      break;
    }

    case 'checkbox': {
      ContentType.changeEditorInterface(control.name, Widgets.CHECKBOX);
      const { options } = control.meta;
      defaultValidations = [...defaultValidations, {
        in: options.map(o => o.label)
      }];
      break;
    }

    case 'boolean': {
      let { falseLabel, trueLabel } = control.meta;
      if (!falseLabel) falseLabel = "No";
      if (!trueLabel) falseLabel = "Yes";
      ContentType.changeEditorInterface(control.name, Widgets.BOOLEAN, {
        trueLabel, falseLabel
      });
      break;
    }
  };

  // Apply Validations
  if (defaultValidations.length) {
    Field.validations(defaultValidations);
  }
}

const buildWebhookType = (migration, key, name) => {
  return migration.createContentType(key).name(name);
}

module.exports = function (migration, context) {
  const { 
    webhookData, 
    webhookTypes, 
    webhookSettings,
    detectedInverseRelationships 
  } = global.webhook2contentful;

  /* Treat settings like any other type */
  if (webhookSettings && webhookSettings.general) {
    webhookData['site_settings'] = webhookSettings.general;
    webhookTypes['site_settings'] = WebhookSiteSettingsType;
  }

  global.webhook2contentful.oneOff = [];
  global.webhook2contentful.originalControls = {};

  /* Build our Main content types */
  const ContentTypeTuples = Object.keys(webhookTypes).map(webhookKey => {
    const webhookType = webhookTypes[webhookKey];
    return { 
      ContentType: buildWebhookType(migration, webhookKey, webhookType.name), 
      webhookKey 
    };
  });

  /* Populate Content Types fields */
  ContentTypeTuples.forEach(({ ContentType, webhookKey }) => {
    if (webhookTypes[webhookKey].oneOff) {
      global.webhook2contentful.oneOff.push(webhookKey);
    }

    global.webhook2contentful.originalControls[webhookKey] = webhookTypes[webhookKey].controls;

    webhookTypes[webhookKey].controls.forEach(control => {
      buildWebhookControlForContentType(
        migration, 
        ContentType, 
        control, 
        (detectedInverseRelationships[webhookKey] || [])
      )
    });
    applyDisplayField(ContentType, webhookTypes[webhookKey].controls.map(c => c.name));
  });
};
