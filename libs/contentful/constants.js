const Types = {
  SYMBOL: 'Symbol',
  TEXT: 'Text',
  INTEGER: 'Integer',
  NUMBER: 'Number',
  DATE: 'Date',
  BOOLEAN: 'Boolean',
  OBJECT: 'Object',
  LOCATION: 'Location',
  RICH_TEXT: 'RichText',
  ARRAY: 'Array',
  LINK: 'Link',
  ENTRY: 'Entry',
  ASSET: 'Asset'
};

const Widgets = {
  DROPDOWN: 'dropdown',
  CHECKBOX: 'checkbox',
  RADIO: 'radio',
  URL_EDITOR: 'urlEditor',
  SLUG_EDITOR: 'slugEditor',
  BOOLEAN: 'boolean',
  ENTRY_LINK_EDITOR: 'entryLinkEditor',
  ENTRY_LINKS_EDITOR: 'entryLinksEditor',
  ENTRY_CARDS_EDITOR: 'entryCardsEditor',
  ASSET_GALLERY_EDITOR: 'assetGalleryEditor',
  MULTIPLE_LINE: 'multipleLine'
};

const WebhookFieldMappings = {
  'radio': {
    contentfulType: Types.SYMBOL
  },
  'wysiwyg': {
    contentfulType: Types.TEXT
  },
  'address': {
    contentfulType: Types.OBJECT
  },
  'textfield': {
    contentfulType: Types.SYMBOL
  },
  'textarea': {
    contentfulType: Types.TEXT
  },
  'datetime': {
    contentfulType: Types.DATE
  },
  'markdown': {
    contentfulType: Types.TEXT
  },
  'url': {
    contentfulType: Types.SYMBOL,
  },
  'embedly': {
    contentfulType: Types.TEXT,
  },
  'email': {
    contentfulType: Types.SYMBOL
  },
  'phone': {
    contentfulType: Types.SYMBOL
  },
  'color': {
    contentfulType: Types.SYMBOL
  },
  'boolean': {
    contentfulType: Types.BOOLEAN,
  },
  'select': {
    contentfulType: Types.SYMBOL
  },
  'checkbox': {
    contentfulType: Types.SYMBOL
  },
  'relation': {},
  'image': {},
  'file': {},
  'gallery': {},
  'grid': {},
}

const WebhookSiteSettingsType = {
  controls: [{
    "controlType": "textarea",
    "hidden": false,
    "label": "Site Description",
    "locked": true,
    "name": "site_description",
    "required": false,
    "showInCms": true 
  }, {
    "controlType": "textfield",
    "hidden": false,
    "label": "Site Facebook",
    "locked": true,
    "name": "site_facebook",
    "required": false,
    "showInCms": true 
  }, {
    "controlType": "textfield",
    "hidden": false,
    "label": "Site Keywords",
    "locked": true,
    "name": "site_keywords",
    "required": false,
    "showInCms": true 
  }, {
    "controlType": "textfield",
    "hidden": false,
    "label": "Site Name",
    "locked": true,
    "name": "site_name",
    "required": false,
    "showInCms": true 
  }, {
    "controlType": "textfield",
    "hidden": false,
    "label": "Site Twitter",
    "locked": true,
    "name": "site_twitter",
    "required": false,
    "showInCms": true 
  }, {
    "controlType": "textfield",
    "hidden": false,
    "label": "Site URL",
    "locked": true,
    "name": "site_url",
    "required": false,
    "showInCms": true 
  }],
  name: "Site Settings",
  oneOff: true
};

module.exports = {
  Types, Widgets, WebhookFieldMappings, WebhookSiteSettingsType
};
