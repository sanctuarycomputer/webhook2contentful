const contentfulImageSize = (image, width, height, crop) => {
  var source = image.resize_url;

  if (width === 'auto' && height === 'auto') {
    return image.resize_url;
  } else if (width === 'auto' && height) {
    source += '?h=' + height;
  } else if (width && height === 'auto') {
    source += '?w=' + width;
  } else if (width && height) {
    source += '?w=' + width + '&h=' + height;
  } else if (width && !height) {
    source += '?w=' + width;
  }

  if (image.resize_url.split('.').pop() == 'tif') {
    source = source.replace('downloads.', 'images.');
    if (source.indexOf('?') === -1) {
      source += '?fm=jpg&q=60';
    } else {
      source += '&fm=jpg&q=60';
    }
  }

  if (crop) {
    if (source.indexOf('?') === -1) {
      source += '?fit=crop';
    } else {
      source += '&fit=crop';
    }
  }
  return source;
};

module.exports = original => {
  return [contentfulImageSize, original];
};
