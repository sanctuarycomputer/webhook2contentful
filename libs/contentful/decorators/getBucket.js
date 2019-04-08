const contentfulExport = require('contentful-export');
const mungeContent = require('../mungeContent');
const mungeTypes = require('../mungeTypes');
const getConfig = require('../getConfig');

require('colors');

let _contentfulResults = null;
let _onceStack = [];

const getBucket = () => {
  console.log("webhook2contentful ~~~> Success, we're using contentful!".green);
  const contentfulConfig = getConfig();

  require('jsonfile').readFile(`${__dirname}/../generatedMeta.json`, function(
    err,
    meta
  ) {
    if (err) return console.error(err);

    contentfulConfig.singletons = meta.oneOff || [];
    contentfulConfig.originalControls = meta.originalControls || {};

    contentfulExport({
      spaceId: contentfulConfig.contentfulSpaceId,
      managementToken: contentfulConfig.contentfulPersonalAccessToken,
      skipRoles: true,
      skipWebhooks: true,
      saveFile: false
    }).then(result => {
      const mungedTypes = mungeTypes(result, contentfulConfig);
      const mungedContent = mungeContent(result, contentfulConfig, mungedTypes);

      Object.keys(mungedTypes).forEach(typeKey => {
        if (typeKey.endsWith('_subitem')) delete mungedTypes[typeKey];
      });

      Object.keys(mungedContent).forEach(typeKey => {
        if (typeKey.endsWith('_subitem')) delete mungedContent[typeKey];
      });

      let mungedSettings = {};
      if (mungedContent['site_settings']) {
        mungedSettings = { general: mungedContent['site_settings'] };
        delete mungedContent['site_settings'];
      }

      _contentfulResults = {
        val: function() {
          return {
            data: mungedContent,
            contentType: mungedTypes,
            settings: mungedSettings
          };
        }
      };
      _onceStack.forEach(cb => cb(_contentfulResults));
      _onceStack = [];
    });
  });

  return {
    once: function(eventName, callback) {
      if (_contentfulResults) return callback(contentfulResults);
      _onceStack.push(callback);
    }
  };
};

module.exports = original => {
  return [getBucket, original];
};
