require('dotenv').config();

module.exports = () => {
  return {
    webhookSiteName: process.env.WEBHOOK_SITE_NAME,
    netlifyDNS: process.env.NETLIFY_DNS,
    contentfulSpaceId: process.env.CONTENTFUL_SPACE_ID,
    contentfulPersonalAccessToken: process.env.CONTENTFUL_PERSONAL_ACCESS_TOKEN
  }
}
