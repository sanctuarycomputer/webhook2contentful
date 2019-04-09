const contentful = require('contentful-management');
const ENTRY_TYPES = ['Link', 'Array'];

const urlExists = require('url-exists');
const urlExistsPromise = url =>
  new Promise((resolve, reject) =>
    urlExists(url, (err, exists) => (err ? reject(err) : resolve(exists)))
  );

const cherrypickFields = (webhookDataset, webhookType, fields, webhookId) => {
  const memo = {};
  if (webhookId) memo.__WEBHOOK_ID__ = webhookId;

  return fields.reduce(
    (acc, field) => {
      acc[field.id] = {
        'en-US': webhookDataset[field.id]
      };

      /* Setup Tabular data */
      const control = webhookType.controls.find(c => c.name === field.id);
      if (control.controlType === 'tabular') {
        acc[field.id] = {
          'en-US': {
            tabular: true,
            keys: control.meta.options.map(tab => tab.value),
            data: webhookDataset[field.id]
          }
        };
      }

      // In validations don't allow nulls. Here we backkport them!
      const inValidation = field.validations.find(v =>
        Object.keys(v).includes('in')
      );
      if (!acc[field.id]['en-US'] && inValidation) {
        if (inValidation) {
          acc[field.id] = {
            'en-US': inValidation['in'][0]
          };
        }
      }

      if (field.type === 'Array') {
        if (field.items.linkType === 'Asset') {
          acc.__BUILD_ASSETS__[field.id] = webhookDataset[field.id];
        } else {
          acc.__RESOLVE_LINKS__ = [...acc.__RESOLVE_LINKS__, field.id];
        }
      }

      if (field.type === 'Link') {
        if (field.linkType === 'Asset') {
          acc.__BUILD_ASSETS__[field.id] = webhookDataset[field.id];
        } else {
          acc.__RESOLVE_LINKS__ = [...acc.__RESOLVE_LINKS__, field.id];
        }
      }

      return acc;
    },
    {
      ...memo,
      __RESOLVE_LINKS__: [],
      __BUILD_ASSETS__: {}
    }
  );
};

const createAsset = async (environment, assetBlueprintItem) => {
  // It's possible for webhook to store a file without
  // a content type, so let's throw
  if (!assetBlueprintItem.type) return Promise.reject();

  // const splat = assetBlueprintItem.url.split('/');
  // const filename = splat[splat.length - 1];
  const [, , guid, filename] = assetBlueprintItem.url.split('/');

  let url = `http://${global.webhook2contentful.webhookSiteName}.webhook.org${
    assetBlueprintItem.url
  }`;

  // let assetPayload =
  if (!(await urlExistsPromise(url))) {
    throw 'Asset URL ${url} does not exist';
  }

  let asset;

  try {
    asset = await environment.getAsset(guid).catch();
    if (asset) {
      console.log(
        `🖼 ~~~> Uploading [${guid}] ${url} found existing asset, skipping`,
        asset.id
      );
      return asset;
    }
  } catch (err) {
    console.log(`🖼 ~~~> Uploading [${guid}] ${url} to Contentful.`);
    try {
      asset = await environment.createAssetWithId(guid, {
        fields: {
          title: { 'en-US': filename },
          file: {
            'en-US': {
              contentType: assetBlueprintItem.type,
              fileName: filename,
              upload: url
            }
          }
        }
      });

      asset = await asset.processForAllLocales();
      asset = await asset.publish();
      return asset;
    } catch (err) {
      console.log(`🚫 ~~~> Uploading [${guid}] ${url} Could NOT process asset`);
    }
  }
};

const buildAssetsForObject = async (environment, obj) => {
  const objKeyResolvers = Object.keys(obj.__BUILD_ASSETS__).reduce(
    async (acc, assetKey) => {
      let assetBlueprint = obj.__BUILD_ASSETS__[assetKey];
      let arrayifiedAssetBlueprint = Array.isArray(assetBlueprint)
        ? assetBlueprint
        : [assetBlueprint];

      if (arrayifiedAssetBlueprint.length === 0) {
        return acc;
      }

      let processedAssets = [];

      const build = arrayifiedAssetBlueprint.reduce(
        async (acc, assetBlueprintItem) => {
          if (!assetBlueprintItem) return acc;

          await acc; //?
          try {
            const asset = await createAsset(environment, assetBlueprintItem);
            processedAssets.push(asset);
            return asset;
          } catch (err) {
            console.log(
              'Skipping one asset that could not be processed',
              assetBlueprintItem
            );
            return err;
          }
        },
        Promise.resolve()
      );

      await acc;
      await build;
      if (Array.isArray(assetBlueprint)) {
        obj.__BUILD_ASSETS__[assetKey] = processedAssets;
      } else {
        obj.__BUILD_ASSETS__[assetKey] = processedAssets[0];
      }
      return processedAssets;
    },
    Promise.resolve()
  );

  /* Wait until all assets are built */
  await objKeyResolvers;

  /* Bring newly created assets back into the fieldset */
  Object.keys(obj.__BUILD_ASSETS__).forEach(key => {
    const assetResult = obj.__BUILD_ASSETS__[key];

    if (!assetResult) {
      delete obj[key];
      delete obj.__BUILD_ASSETS__[key];
      return;
    }

    if (Array.isArray(assetResult)) {
      obj[key] = {
        'en-US': assetResult.map(asset => ({
          sys: { type: 'Link', linkType: 'Asset', id: asset.sys.id }
        }))
      };
    } else {
      obj[key] = {
        'en-US': {
          sys: { type: 'Link', linkType: 'Asset', id: assetResult.sys.id }
        }
      };
    }
    delete obj.__BUILD_ASSETS__[key];
  });
  return Promise.resolve(obj);
};

const createContentfulDataset = async (
  environment,
  contentType,
  webhookKey,
  webhookType,
  webhookDataset,
  detectedInverseRelationships
) => {
  let workingSet;
  if (webhookType.oneOff) {
    workingSet = [
      cherrypickFields(webhookDataset, webhookType, contentType.fields, false)
    ];
  } else {
    workingSet = Object.keys(webhookDataset).map(webhookId => {
      const itemData = webhookDataset[webhookId];
      return cherrypickFields(
        itemData,
        webhookType,
        contentType.fields,
        webhookId
      );
    });
  }

  await workingSet.reduce(async (acc, obj) => {
    await acc;
    return buildAssetsForObject(environment, obj);
  }, Promise.resolve());

  console.log(`✅ ~~~> Finished building assets for ${webhookKey}`);

  /* Attempt to persist the dataset itself */
  let persisted = false;
  let persistedWorkingSet = {};

  if (workingSet.some(obj => obj.__RESOLVE_LINKS__.length > 0)) {
    console.log(
      `🚫 ~~~> Couldn't persist ${webhookKey} yet, as further links are required.`
    );
  } else {
    await workingSet.reduce(async (acc, fields) => {
      let webhookId;
      if (fields.__WEBHOOK_ID__) {
        webhookId = fields.__WEBHOOK_ID__;
        delete fields.__WEBHOOK_ID__;
      }
      delete fields.__RESOLVE_LINKS__;
      delete fields.__BUILD_ASSETS__;

      await acc;
      try {
        let entry = await environment.createEntry(webhookKey, { fields });
      } catch (err) {
        console.log('~~~~~~~~~> Could not create entry', err);
        throw err;
      }
      try {
        entry = await entry.publish();
      } catch (err) {
        console.log(`🚫 ~~~> Could NOT publish ${webhookKey}.`, err);
        // Let it slide, it will just be in draft more
        return err;
      }

      console.log(`✅ ~~~> Published ${webhookKey}.`, webhookId);
      if (webhookId) {
        persistedWorkingSet[webhookId] = entry;
      } else {
        persistedWorkingSet['oneOff'] = entry;
      }
      return entry;
    }, Promise.resolve());

    persisted = true;
    console.log(
      `✅ ~~~> Did persist ${webhookKey} as all links were resolved on first pass.`
    );
  }

  if (persisted) {
    persistedWorkingSet = webhookType.oneOff
      ? persistedWorkingSet['oneOff']
      : persistedWorkingSet;
    return await Promise.resolve({
      workingSet: persistedWorkingSet,
      persisted: true
    });
  } else {
    workingSet = webhookType.oneOff ? workingSet[0] : workingSet;
    return await Promise.resolve({
      workingSet,
      persisted: false
    });
  }
};

const findPersistedEntryForRelation = (persisted, webhookRelation) => {
  const splat = webhookRelation.split(' ');

  if (splat.length === 2) {
    /* Refers to something in a collection */
    const [webhookKey, webhookId] = splat;
    if (persisted[webhookKey] && persisted[webhookKey][webhookId]) {
      return persisted[webhookKey][webhookId];
    }
    return false;
  } else if (splat.length === 1) {
    /* Refers to a singleton */
    const webhookKey = splat[0];
    if (persisted[webhookKey]) {
      return persisted[webhookKey];
    }
    return false;
  }

  console.warn('W2C ~~~> !!! SPLAT WEIRD', splat);
  return false;
};

const resolveLinksForObject = (
  obj,
  persisted,
  webhookType,
  stack,
  webhookId,
  webhookKey
) => {
  obj.__RESOLVE_LINKS__.forEach(key => {
    const unresolved = obj[key]['en-US'];
    const control = webhookType.controls.find(c => c.name === key);

    /* Stash Grids for later */
    if (control.controlType === 'grid') {
      stack.grids.push({
        webhookKey,
        webhookId,
        key,
        data: unresolved
      });
      delete obj[key];
      obj.__RESOLVE_LINKS__ = obj.__RESOLVE_LINKS__.filter(
        unresolvedKey => unresolvedKey !== key
      );
      return;
    }

    if (Array.isArray(unresolved)) {
      /* Relationship not populated, ignore this key */
      if (unresolved.length === 0) {
        obj.__RESOLVE_LINKS__ = obj.__RESOLVE_LINKS__.filter(
          unresolvedKey => unresolvedKey !== key
        );
        return;
      }
      const entries = unresolved.map(webhookRelation => {
        return findPersistedEntryForRelation(persisted, webhookRelation);
      });
      if (entries.every(entry => entry === false)) return;
      if (entries.some(entry => entry === false)) {
        console.log(
          `W2C ~~~> !!! BAD CASE, should never happen -> ${key}`,
          webhookType.name,
          obj
        );
        return;
      }

      obj[key] = {
        'en-US': entries.map(entry => ({
          sys: { type: 'Link', linkType: 'Entry', id: entry.sys.id }
        }))
      };
      obj.__RESOLVE_LINKS__ = obj.__RESOLVE_LINKS__.filter(
        unresolvedKey => unresolvedKey !== key
      );
    } else {
      /* Relationship not populated, ignore this key */
      if (!unresolved) {
        obj.__RESOLVE_LINKS__ = obj.__RESOLVE_LINKS__.filter(
          unresolvedKey => unresolvedKey !== key
        );
        return;
      }
      const entry = findPersistedEntryForRelation(persisted, unresolved);
      if (!entry) return;
      obj[key] = {
        'en-US': {
          sys: { type: 'Link', linkType: 'Entry', id: entry.sys.id }
        }
      };
      obj.__RESOLVE_LINKS__ = obj.__RESOLVE_LINKS__.filter(
        unresolvedKey => unresolvedKey !== key
      );
    }
  });
};

const resolveLinksForCollection = (
  collection,
  persisted,
  webhookType,
  stack,
  webhookKey
) => {
  collection.forEach(obj => {
    resolveLinksForObject(
      obj,
      persisted,
      webhookType,
      stack,
      obj.__WEBHOOK_ID__,
      webhookKey
    );
  });
};

let passes = 0;
const resolveLinksAcrossStack = async (environment, stack, webhookTypes) => {
  passes++;
  console.log(`🔥 ~~~> Starting link resolution pass: ${passes}.`);

  const chain = Object.keys(stack.waiting).reduce(async (acc, webhookKey) => {
    await acc;

    const workingSet = stack.waiting[webhookKey];

    if (Array.isArray(workingSet)) {
      resolveLinksForCollection(
        workingSet,
        stack.persisted,
        webhookTypes[webhookKey],
        stack,
        webhookKey
      );
      if (workingSet.some(obj => obj.__RESOLVE_LINKS__.length > 0)) {
        console.log(
          `🚫 ~~~> Couldn't persist ${webhookKey} yet, as further links are required.`
        );
        return Promise.resolve();
      } else {
        console.log(
          `⌛ ~~~> Did resolve all links for ${webhookKey} on pass: ${passes}, beginning persistance!`
        );

        let persistedWorkingSet = {};
        const chain = workingSet.reduce(async (acc, fields) => {
          let webhookId;
          if (fields.__WEBHOOK_ID__) {
            webhookId = fields.__WEBHOOK_ID__;
            delete fields.__WEBHOOK_ID__;
          }
          delete fields.__RESOLVE_LINKS__;
          delete fields.__BUILD_ASSETS__;

          await acc;

          try {
            let entry = await environment.createEntry(webhookKey, { fields });
            entry = await entry.publish();

            if (webhookId) {
              persistedWorkingSet[webhookId] = entry;
            }
            console.log(
              `🙄 ~~~> Did persist a ${webhookKey} record, moving on...`
            );
            return entry;
          } catch (err) {
            console.log(`🚫 ~~~> Could NOT publish ${webhookKey}.`, err);
            throw err;
          }
        }, Promise.resolve());

        await chain;
        console.log(
          `✅ ~~~> Did persist all items for ${webhookKey} on pass: ${passes}.`
        );
        delete stack.waiting[webhookKey];
        stack.persisted[webhookKey] = persistedWorkingSet;
        return;
      }
    } else {
      resolveLinksForObject(
        workingSet,
        stack.persisted,
        webhookTypes[webhookKey],
        stack,
        webhookKey,
        webhookKey
      );
      if (workingSet.__RESOLVE_LINKS__.length > 0) {
        console.log(
          `🚫 ~~~> Couldn't persist ${webhookKey} yet, as further links are required.`
        );
        return Promise.resolve();
      } else {
        console.log(
          `⌛ ~~~> Did resolve all links for ${webhookKey} on pass: ${passes}, beginning persistance!`
        );
        delete workingSet.__RESOLVE_LINKS__;
        delete workingSet.__BUILD_ASSETS__;
        try {
          let entry = await environment.createEntry(webhookKey, {
            fields: workingSet
          });
          entry = await entry.publish();

          console.log(
            `✅ ~~~> Did persist oneOff item for ${webhookKey} on pass: ${passes}.`
          );
          delete stack.waiting[webhookKey];
          stack.persisted[webhookKey] = entry;
          return entry;
        } catch (err) {
          console.log(`🚫 ~~~> Could NOT publish ${webhookKey}.`, err);
          throw err;
        }
      }
    }
  }, Promise.resolve());

  await chain;
  if (Object.keys(stack.waiting).length > 0) {
    console.log("🎇 !!! Pass completed, we're going in again!");
    return resolveLinksAcrossStack(environment, stack, webhookTypes);
  } else {
    return Promise.resolve();
  }
};

const persistGridItems = (environment, stack, webhookTypes) => {
  return stack.grids.reduce(async (chain, gridDataset) => {
    await chain;
    if (!gridDataset.data) return Promise.resolve();
    const fauxWebhookKey = `${gridDataset.key}_subitem`;

    try {
      /* Load the content type for the grid item */
      const ContentType = await environment.getContentType(fauxWebhookKey);

      const fauxWebhookType = {
        oneOff: false,
        controls: webhookTypes[gridDataset.webhookKey].controls.find(
          c => c.name === gridDataset.key
        ).controls
      };

      const { workingSet, persisted } = await createContentfulDataset(
        environment,
        ContentType,
        fauxWebhookKey,
        fauxWebhookType,
        gridDataset.data
      );
      if (persisted) {
        /* Resolve the parent */
        let parentEntry;
        if (webhookTypes[gridDataset.webhookKey].oneOff) {
          parentEntry = stack.persisted[gridDataset.webhookKey];
        } else {
          parentEntry =
            stack.persisted[gridDataset.webhookKey][gridDataset.webhookId];
        }
        try {
          /* Reload the parent entry to avoid 409 Conflicts */
          const reloadedEntry = await environment.getEntry(parentEntry.sys.id);

          reloadedEntry.fields[gridDataset.key] = {
            'en-US': Object.values(workingSet).map(entry => ({
              sys: { type: 'Link', linkType: 'Entry', id: entry.sys.id }
            }))
          };
          return await reloadedEntry.update();
        } catch (err) {
          console.log('Couldnt reload the parent entry for a grid item', err);
          return err;
        }
      } else {
        console.log(
          `!!! ~~~~> Your ${fauxWebhookKey} grid items have relationships! This case is not supported by webhook2contentful yet.`
        );
        return Promise.resolve();
      }
    } catch (err) {
      console.log('!!! Could not finalize a grid item ~~~~>', gridDataset.data);
      console.log(err);
      return err;
    }
  }, Promise.resolve());
};

module.exports = async function({
  webhookData,
  webhookTypes,
  detectedInverseRelationships
}) {
  const client = contentful.createClient({
    accessToken: global.webhook2contentful.contentfulPersonalAccessToken
  });

  const space = await client.getSpace(
    global.webhook2contentful.contentfulSpaceId
  );
  const environment = await space.getEnvironment(
    global.webhook2contentful.contentfulConfig.contentfulEnvironmentId
  );
  console.log(
    `⌛ ~~~> Loading your Contentful space data... [${
      global.webhook2contentful.contentfulSpaceId
    }:${global.webhook2contentful.contentfulEnvironmentId}]`
  );

  /* Preload the Content Types */
  const ContentTypes = {};
  await Object.keys(webhookData).reduce(async (acc, webhookKey) => {
    const webhookType = webhookTypes[webhookKey];
    if (!webhookType) return acc;

    await acc;

    console.log(`~~~> Loading Contentful content type: ${webhookKey}`);
    const contentType = await environment.getContentType(webhookKey);
    ContentTypes[webhookKey] = contentType;
    return;
  }, Promise.resolve());
  console.log(`✅ ~~~> Loaded your Contentful space data!`);

  /* Let's take a pass */
  const stack = { persisted: {}, waiting: {}, grids: [], tabulars: [] };

  await Object.keys(webhookData).reduce(async (acc, webhookKey) => {
    const webhookType = webhookTypes[webhookKey];
    if (!webhookType) return acc;
    const webhookDataset = webhookData[webhookKey];

    await acc;

    console.log(`🔨 ~~~> Taking initial pass for: ${webhookKey}`);

    const { persisted, workingSet } = await createContentfulDataset(
      environment,
      ContentTypes[webhookKey],
      webhookKey,
      webhookType,
      webhookDataset
    );
    if (persisted) {
      stack.persisted[webhookKey] = workingSet;
    } else {
      stack.waiting[webhookKey] = workingSet;
    }
    return;
  }, Promise.resolve());

  await resolveLinksAcrossStack(environment, stack, webhookTypes);
  await persistGridItems(environment, stack, webhookTypes);

  console.log(
    "🎉 ~~~> FINISHED! You're now riding on Contentful. Try a `wh serve` and see the magic."
  );
};
