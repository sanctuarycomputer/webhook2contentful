const runMigration = require('contentful-migration/built/bin/cli').runMigration;
const getConfig = require('./getConfig');

module.exports = (webhookData, webhookTypes, webhookSettings, done, cb) => {
  const detectedInverseRelationships = require(`./detectInverseRelationships`)(
    webhookTypes
  );

  global.webhook2contentful = {
    ...getConfig(),
    webhookData,
    webhookTypes,
    webhookSettings,
    detectedInverseRelationships
  };

  runMigration({
    filePath: `${__dirname}/migrate.js`,
    spaceId: global.webhook2contentful.contentfulSpaceId,
    accessToken: global.webhook2contentful.contentfulPersonalAccessToken
  })
    .then(() => {
      return new Promise((resolve, reject) => {
        require('jsonfile').writeFile(
          `${__dirname}/generatedMeta.json`,
          {
            oneOff: global.webhook2contentful.oneOff,
            originalControls: global.webhook2contentful.originalControls
          },
          function(err) {
            if (err) return reject(err);
            require(`${__dirname}/populate.js`)(global.webhook2contentful)
              .then(() => {
                return runMigration({
                  filePath: `${__dirname}/postMigrate.js`,
                  spaceId: global.webhook2contentful.contentfulSpaceId,
                  accessToken:
                    global.webhook2contentful.contentfulPersonalAccessToken
                }).then(() => {
                  if (cb) cb(done);
                });
              })
              .catch(reject);
          }
        );
      });
    })
    .catch(err => {
      console.error(err);
      if (cb) cb(done);
    });
};
