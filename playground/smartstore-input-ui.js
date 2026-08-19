(() => {
  const MAX_PRODUCTS = 5;
  const productsElement = document.querySelector('#products');
  const productTemplate = document.querySelector('#product-template');
  const featureTemplate = document.querySelector('#feature-template');
  const addProductButton = document.querySelector('#add-product');
  const productCountElement = document.querySelector('#product-count');
  const limitMessageElement = document.querySelector('#product-limit-message');
  const previewElement = document.querySelector('#json-preview');

  const optionalValue = (value) => {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  };

  const addOptionalValue = (target, key, value) => {
    const normalized = optionalValue(value);
    if (normalized !== undefined) target[key] = normalized;
  };

  const createFeature = (productCard, value = '') => {
    const feature = featureTemplate.content.firstElementChild.cloneNode(true);
    feature.querySelector('.feature-input').value = value;
    productCard.querySelector('.features').append(feature);
    updateFeatureButtons(productCard);
  };

  const updateFeatureButtons = (productCard) => {
    const rows = productCard.querySelectorAll('.feature-row');
    for (const row of rows) {
      row.querySelector('.remove-feature').disabled = rows.length === 1;
    }
  };

  const refreshProductLabels = () => {
    const cards = productsElement.querySelectorAll('.product-card');
    cards.forEach((card, index) => {
      const number = String(index + 1).padStart(2, '0');
      card.dataset.productIndex = String(index);
      card.querySelector('.product-number').textContent = `PRODUCT ${number}`;
      card.querySelector('.product-title').textContent = `상품 ${index + 1}`;
      card.querySelector('.remove-product').disabled = cards.length === 1;
    });

    productCountElement.textContent = `상품 ${cards.length} / ${MAX_PRODUCTS}`;
    addProductButton.disabled = cards.length >= MAX_PRODUCTS;
  };

  const createProduct = () => {
    if (productsElement.children.length >= MAX_PRODUCTS) {
      limitMessageElement.textContent =
        '상품은 최대 5개까지 추가할 수 있습니다.';
      return false;
    }

    const card = productTemplate.content.firstElementChild.cloneNode(true);
    productsElement.append(card);
    createFeature(card);
    limitMessageElement.textContent = '';
    refreshProductLabels();
    updatePreview();
    return true;
  };

  const readProduct = (card) => {
    const value = (field) =>
      card.querySelector(`[data-product-field="${field}"]`).value;
    const product = {
      name: value('name'),
      price: value('price'),
      features: [...card.querySelectorAll('.feature-input')].map(
        (input) => input.value,
      ),
      recommendationReason: value('recommendationReason'),
      url: value('url'),
    };

    addOptionalValue(product, 'mainImage', value('mainImage'));
    addOptionalValue(product, 'secondaryImage', value('secondaryImage'));
    return product;
  };

  const getInputData = () => {
    const storeValue = (field) =>
      document.querySelector(`[data-store-field="${field}"]`).value;
    const input = {
      storeName: storeValue('storeName'),
      category: storeValue('category'),
      targetCustomer: storeValue('targetCustomer'),
      newsletterTopic: storeValue('newsletterTopic'),
      tone: storeValue('tone'),
      products: [...productsElement.querySelectorAll('.product-card')].map(
        readProduct,
      ),
    };

    addOptionalValue(input, 'storeUrl', storeValue('storeUrl'));
    addOptionalValue(input, 'heroImage', storeValue('heroImage'));
    return input;
  };

  function updatePreview() {
    previewElement.textContent = JSON.stringify(getInputData(), null, 2);
  }

  document
    .querySelector('#smartstore-form')
    .addEventListener('input', updatePreview);

  addProductButton.addEventListener('click', () => {
    createProduct();
  });

  productsElement.addEventListener('click', (event) => {
    const productCard = event.target.closest('.product-card');
    if (!productCard) return;

    if (event.target.closest('.add-feature')) {
      createFeature(productCard);
      updatePreview();
      return;
    }

    if (event.target.closest('.remove-feature')) {
      const rows = productCard.querySelectorAll('.feature-row');
      if (rows.length > 1) event.target.closest('.feature-row').remove();
      updateFeatureButtons(productCard);
      updatePreview();
      return;
    }

    if (event.target.closest('.remove-product')) {
      if (productsElement.children.length > 1) productCard.remove();
      refreshProductLabels();
      updatePreview();
    }
  });

  window.HOSSmartStoreInputUI = { getInputData };
  createProduct();
})();
