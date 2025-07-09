// lib/mockS3.js
const mockS3 = {
  // Mock fetching image list (expects an array of image objects in localStorage)
  listObjectsV2() {
    const images = JSON.parse(localStorage.getItem('galleryImages') || '[]')
    return {
      promise: () => Promise.resolve({ Contents: images }),
    }
  },

  // Mock signed URL generation
  getSignedUrl(operation, params) {
    if (operation === 'getObject') {
      return `https://mock-s3-url.com/${params.Key}?signed`
    }
    throw new Error('Unsupported operation: ' + operation)
  },
}

export default mockS3
