const getConfig = require('../getConfig');

const getDnsChild = () => {
  return {
    once: function(eventName, callback) {
      callback({
        val: function() { return getConfig().netlifyDNS; }
      });
    }
  }
}

module.exports = (original) => {
  return [getDnsChild, original];
}
