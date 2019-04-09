const runMigration = require('contentful-migration/built/bin/cli').runMigration;
const getConfig = require('./getConfig');

module.exports = async (
  webhookData,
  webhookTypes,
  webhookSettings,
  done,
  cb
) => {
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

  try {
    console.log('~~> Running ', `${__dirname}/migrate.js`);
    await runMigration({
      filePath: `${__dirname}/migrate.js`,
      spaceId: global.webhook2contentful.contentfulSpaceId,
      accessToken: global.webhook2contentful.contentfulPersonalAccessToken,
      environmentId: contentfulConfig.contentfulEnvironmentId
    });

    console.log('~~> Writing ', `${__dirname}/generatedMeta.json`);
    require('jsonfile').writeFileSync(`${__dirname}/generatedMeta.json`, {
      oneOff: global.webhook2contentful.oneOff,
      originalControls: global.webhook2contentful.originalControls
    });

    console.log('~~> Running ', `${__dirname}/populate.js`);
    await require(`${__dirname}/populate.js`)(global.webhook2contentful);

    console.log('~~> Running ', `${__dirname}/postMigrate.js`);
    await runMigration({
      filePath: `${__dirname}/postMigrate.js`,
      spaceId: global.webhook2contentful.contentfulSpaceId,
      accessToken: global.webhook2contentful.contentfulPersonalAccessToken,
      environmentId: contentfulConfig.contentfulEnvironmentId
    });

    if (cb) cb(done);
  } catch (err) {
    console.error(err);
    if (cb) cb(done);
  }
};
