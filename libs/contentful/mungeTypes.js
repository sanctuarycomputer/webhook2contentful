const Constants = require('./constants');
const { Types, Widgets, WebhookFieldMappings } = Constants;

const controlTypeForField = (field, editor, originalControls) => {
  if (field.type === Types.ARRAY) {
    if (field.items.linkType === Types.ASSET) {
      const linkValidation = 
        field.items.validations.find(v => Object.keys(v).includes("linkMimetypeGroup"));
      if (!linkValidation) throw "Array.Asset.noValidation";
      if (linkValidation.linkMimetypeGroup[0] === "image") {
        return { controlType: "gallery" };
      }
      console.log(field);
      throw "Array.Asset.notImplemented";
    } 

    if (field.items.linkType === Types.ENTRY) {
      const linkValidation = 
        field.items.validations.find(v => Object.keys(v).includes("linkContentType"));
      if (!linkValidation) throw "Array.Entry.noValidation";
      if (linkValidation.linkContentType[0].endsWith("_subitem")) {
        return { controlType: "grid", _unresolved: true };
      }
      return { controlType: 'relation', meta: { contentTypeId: linkValidation.linkContentType[0] } };
    } 
    console.log(field);
    throw "Array.unknownItemLinkType";
  }

  if (field.type === Types.LINK) {
    if (field.linkType === Types.ASSET) {
      const linkValidation = 
        field.validations.find(v => Object.keys(v).includes("linkMimetypeGroup"));
      if (!linkValidation) throw "Link.Asset.noValidation";
      if (linkValidation.linkMimetypeGroup[0] === "image") {
        return { controlType: "image" };
      }
      console.log(field);
      throw "Link.Asset.unknownValidation"
    } 

    if (field.linkType === Types.ENTRY) {
      const linkValidation = 
        field.validations.find(v => Object.keys(v).includes("linkContentType"));
      if (!linkValidation) throw "Link.Entry.noValidation";
      return { controlType: 'relation', meta: { contentTypeId: linkValidation.linkContentType[0], isSingle: true } };
    } 
    console.log(field);
    throw "Link.unknownLinktype";
  }

  if (field.type === Types.SYMBOL) {
    if (!editor) return { controlType: "textfield" };
    const widgetId = editor.controls.find(c => c.fieldId === field.id).widgetId;
    if (widgetId === Widgets.DROPDOWN) {
      const type = { controlType: "select" };
      const validation = field.validations.find(v => Object.keys(v).includes("in"));
      if (validation) {
        type.meta = {
          defaultValue: validation.in[0],
          options: validation.in.map(value => { value })
        }
      }
      return type;
    }
    if (widgetId === Widgets.CHECKBOX) throw "TODO: Symbol.Checkbox.notImplemented";
    if (widgetId === Widgets.SLUG_EDITOR) return { controlType: "textfield" };
    if (widgetId === Widgets.URL_EDITOR) return { controlType: "url" };
    return { controlType: "textfield" };
  }

  if (field.type === Types.TEXT) {
    const widgetId = editor.controls.find(c => c.fieldId === field.id).widgetId;
    if (widgetId === Widgets.MARKDOWN) return { controlType: "markdown" };
    return { controlType: "textarea" };
  }

  if (field.type === Types.BOOLEAN) {
    const contentfulControl = editor.controls.find(c => c.fieldId === field.id);
    return {
      controlType: "boolean",
      meta: {
        defaultValue: true,
        falseLabel: contentfulControl.settings.falseLabel,
        trueLabel: contentfulControl.settings.trueLabel
      }
    };
  }

  if (field.type === Types.DATE) {
    console.log(field, editor);
    throw "TODO: Date.notImplemented";
  }

  if (field.type === Types.OBJECT) {
    // Check the original control
    const originalControl = (originalControls || []).find(c => c.name === field.id);

    if (originalControl) {
      return {
        controlType: originalControl.controlType
      }
    }

    return {
      controlType: "address",
    };
  }

  console.log(field, editor);
  throw "TODO: Primitive.NotImplemented";
}

const editorForField = (contentTypeId, fieldId, editors) => {
  const editorsForContentType = editors.filter(e => e.sys.contentType.sys.id === contentTypeId);
  return editorsForContentType.find(e => !!e.controls.find(c => c.fieldId === fieldId));
}

const makeControls = (entry, editors) => {
  return entry.fields.map(field => {
    const editor = editorForField(entry.sys.id, field.id, editors); 
    return {
      ...controlTypeForField(field, editor),
      label: field.name,
      locked: false,
      name: field.id,
      required: field.required,
      showInCms: true
    }
  });
};

const resolveGridTypes = mungedTypes => {
  Object.values(mungedTypes).forEach(type => {
    type.controls.forEach(control => {
      if (control.controlType === 'grid' && control._unresolved) {
        control.controls = mungedTypes[`${control.name}_subitem`].controls;
        delete control._unresolved;
      }
    })
  });
};

module.exports = (result, config) => {
  const mungedTypes = {};
  result.contentTypes.forEach(entry => {
    mungedTypes[entry.sys.id] = {
      controls: makeControls(entry, result.editorInterfaces, config.originalControls[entry.sys.id]),
      name: entry.name,
    }
    if (config.singletons.includes(entry.sys.id)) {
      mungedTypes[entry.sys.id]['oneOff'] = true;
    }
  });
  resolveGridTypes(mungedTypes);
  return mungedTypes;
}
