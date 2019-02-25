const Constants = require('./constants');
const { Types, Widgets, WebhookFieldMappings } = Constants;

const deserializeImageAsset = asset => {
  const file = asset.fields.file['en-US'];
  return {
    caption: (asset.fields.description ? asset.fields.description['en-US'] : ""),
    height: file.details.image.height,
    resize_url: file.url,
    size: file.details.size,
    type: file.contentType,
    url: file.url,
    width: file.details.image.width
  };
}

const deserializeFileAsset = asset => {
  const file = asset.fields.file['en-US'];
  return {
    size: file.details.size,
    type: file.contentType,
    url: file.url,
  };
}

const deserializeSingularValue = (value, control, result) => {
  /* Value is tabular */ 
  if (value && value.tabular) return value.data; 
  /* Value is primitive, return it as is. Oneday this maybe needs a coersion layer. */ 
  if (!value.sys) return value;
  
  /* Handle case when value is a Link or Asset */
  if (value.sys.type === Types.LINK) {
    if (value.sys.linkType === Types.ASSET) {
      const asset = result.assets.find(a => a.sys.id === value.sys.id)
      if (!asset) return null;

      if (control.controlType === "image") {
        return deserializeImageAsset(asset);
      }
      if (control.controlType === "gallery") {
        return deserializeImageAsset(asset);
      }
      if (control.controlType === "file") {
        return deserializeFileAsset(asset);
      }
      console.log(value.sys, control);
      throw "deserializeSingularValue link.asset.unknownValueType";
    }
    if (value.sys.linkType === Types.ENTRY) {
      const linked = result.entries.find(e => e.sys.id === value.sys.id);
      if (!linked) return null;

      return `${linked.sys.contentType.sys.id} ${value.sys.id}`;
    }
  }

  console.log(value);
  throw "unknownValueType";
}

const deserialize = (entry, mungedTypes, result) => {
  const deserialized = {
    publish_date: entry.sys.publishedAt 
  };

  const contentTypeKey = entry.sys.contentType.sys.id;
  const mungedType = mungedTypes[contentTypeKey];

  mungedType.controls.forEach(control => {
    const valueKey = entry.fields[control.name];

    /* Contentful doesn't return undefined data, so set it to null */
    if (!valueKey) return deserialized[control.name] = null;
    const value = valueKey['en-US'];

    /* Handle Links & Grids */
    if (Array.isArray(value)) {
      if (control.controlType === 'grid') {
        return (deserialized[control.name] = value.map(gridItem => {
          return result.entries.find(e => e.sys.id === gridItem.sys.id);
        }).filter(e => !!e).map(entry => {
          return deserialize(entry, mungedTypes, result);
        }));
      }
      return deserialized[control.name] = value.map(subvalue => deserializeSingularValue(subvalue, control, result));
    }

    /* Handle Single Links & Primitives */
    return deserialized[control.name] = deserializeSingularValue(value, control, result);
  });
  return deserialized;
}

module.exports = (result, config, mungedTypes) => {
  const mungedContent = {};
  result.entries.forEach(entry => {
    const contentTypeKey = entry.sys.contentType.sys.id;
    if (config.singletons.includes(contentTypeKey)) {
      mungedContent[contentTypeKey] = deserialize(entry, mungedTypes, result);
    } else {
      mungedContent[contentTypeKey] = mungedContent[contentTypeKey] || {};
      mungedContent[contentTypeKey][entry.sys.id] = deserialize(entry, mungedTypes, result);
    }
  });
  return mungedContent;
}
