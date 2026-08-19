(() => {
  const MAX_PRODUCTS = 5;
  const productsElement = document.querySelector('#products');
  const productTemplate = document.querySelector('#product-template');
  const featureTemplate = document.querySelector('#feature-template');
  const addProductButton = document.querySelector('#add-product');
  const productCountElement = document.querySelector('#product-count');
  const limitMessageElement = document.querySelector('#product-limit-message');
  const previewElement = document.querySelector('#json-preview');
  const storeSummaryElement = document.querySelector('#store-summary');
  const productSummaryElement = document.querySelector('#product-summary');
  const summaryProductCountElement = document.querySelector(
    '#summary-product-count',
  );
  const workflowStatus = document.querySelector('#workflow-status');
  const workflowBadge = document.querySelector('#workflow-badge');
  const validationErrors = document.querySelector('#validation-errors');
  const generateButton = document.querySelector('#generate-newsletter');
  const previewButton = document.querySelector('#open-preview');
  const actionButtons = [...document.querySelectorAll('.action-grid button')];

  let confirmedHash;
  let previewUrl;
  let busy = false;

  const optionalValue = (value) => {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  };

  const addOptionalValue = (target, key, value) => {
    const normalized = optionalValue(value);
    if (normalized !== undefined) target[key] = normalized;
  };

  const hasValue = (value) =>
    typeof value === 'string' && value.trim().length > 0;

  const displayValue = (value) => (hasValue(value) ? value.trim() : '미입력');

  const createSummaryRow = (label, value) => {
    const row = document.createElement('div');
    row.className = 'summary-row';
    const term = document.createElement('dt');
    term.textContent = label;
    const description = document.createElement('dd');
    description.textContent = value;
    row.append(term, description);
    return row;
  };

  const renderSummary = (data) => {
    const storeFields = [
      ['스토어명', data.storeName],
      ['스토어 URL', data.storeUrl],
      ['카테고리', data.category],
      ['주요 고객', data.targetCustomer],
      ['뉴스레터 주제', data.newsletterTopic],
      ['말투', data.tone],
      ['등록 상품 수', `${data.products.length}개`],
    ];
    storeSummaryElement.replaceChildren(
      ...storeFields.map(([label, value]) =>
        createSummaryRow(label, displayValue(value)),
      ),
    );

    summaryProductCountElement.textContent = `${data.products.length}개`;
    const cards = data.products.map((product, index) => {
      const card = document.createElement('article');
      card.className = 'summary-product-card';

      const heading = document.createElement('div');
      heading.className = 'summary-product-title';
      const number = document.createElement('span');
      number.textContent = `상품 ${index + 1}`;
      const name = document.createElement('strong');
      name.textContent = displayValue(product.name);
      heading.append(number, name);

      const details = document.createElement('dl');
      details.append(
        createSummaryRow('가격', displayValue(product.price)),
        createSummaryRow(
          '특징',
          `${product.features.filter(hasValue).length}개`,
        ),
        createSummaryRow(
          '추천 이유',
          hasValue(product.recommendationReason) ? '있음' : '없음',
        ),
        createSummaryRow('상품 URL', hasValue(product.url) ? '있음' : '없음'),
        createSummaryRow(
          '이미지',
          hasValue(product.mainImage) || hasValue(product.secondaryImage)
            ? '있음'
            : '없음',
        ),
      );
      card.append(heading, details);
      return card;
    });
    productSummaryElement.replaceChildren(...cards);
  };

  const setStatus = (message, state = 'idle') => {
    workflowStatus.textContent = message;
    workflowStatus.dataset.state = state;
    const badges = {
      idle: '입력 중',
      success: '준비 완료',
      error: '확인 필요',
      busy: '처리 중',
    };
    workflowBadge.textContent = badges[state] ?? badges.idle;
  };

  const clearErrors = () => {
    validationErrors.replaceChildren();
  };

  const showErrors = (issues = []) => {
    clearErrors();
    for (const issue of issues) {
      const item = document.createElement('li');
      item.textContent = issue.path
        ? `${issue.path}: ${issue.message}`
        : issue.message;
      validationErrors.append(item);
    }
  };

  const updateActionButtons = () => {
    for (const button of actionButtons) button.disabled = busy;
    generateButton.disabled = busy || !confirmedHash;
    previewButton.disabled = busy || !previewUrl;
  };

  const setBusy = (value, message) => {
    busy = value;
    updateActionButtons();
    if (message) setStatus(message, value ? 'busy' : 'idle');
  };

  const invalidateConfirmation = () => {
    confirmedHash = undefined;
    previewUrl = undefined;
    updateActionButtons();
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

  const setProductField = (card, field, value = '') => {
    card.querySelector(`[data-product-field="${field}"]`).value = value;
  };

  const createProduct = (product = {}) => {
    if (productsElement.children.length >= MAX_PRODUCTS) {
      limitMessageElement.textContent =
        '상품은 최대 5개까지 추가할 수 있습니다.';
      return false;
    }

    const card = productTemplate.content.firstElementChild.cloneNode(true);
    productsElement.append(card);
    for (const field of [
      'url',
      'name',
      'price',
      'recommendationReason',
      'mainImage',
      'secondaryImage',
    ]) {
      setProductField(card, field, product[field]);
    }
    const features =
      Array.isArray(product.features) && product.features.length
        ? product.features
        : [''];
    for (const feature of features) createFeature(card, feature);
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

  const setInputData = (input) => {
    for (const field of [
      'storeName',
      'storeUrl',
      'category',
      'targetCustomer',
      'newsletterTopic',
      'tone',
      'heroImage',
    ]) {
      document.querySelector(`[data-store-field="${field}"]`).value =
        input[field] ?? '';
    }

    productsElement.replaceChildren();
    for (const product of input.products ?? []) createProduct(product);
    if (productsElement.children.length === 0) createProduct();
    refreshProductLabels();
    updatePreview();
    invalidateConfirmation();
  };

  function updatePreview() {
    const data = getInputData();
    renderSummary(data);
    previewElement.textContent = JSON.stringify(data, null, 2);
  }

  const callApi = async (path, options = {}) => {
    const response = await fetch(path, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
    const body = await response.json();
    if (!response.ok || !body.ok) {
      const error = new Error(body.message ?? '요청을 처리하지 못했습니다.');
      error.issues = body.issues ?? [];
      throw error;
    }
    return body;
  };

  const runAction = async (message, action) => {
    clearErrors();
    setBusy(true, message);
    try {
      const result = await action();
      setStatus(result.message, 'success');
      return result;
    } catch (error) {
      showErrors(error.issues);
      setStatus(error.message, 'error');
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  document.querySelector('#smartstore-form').addEventListener('input', () => {
    updatePreview();
    invalidateConfirmation();
    clearErrors();
    setStatus('입력 내용이 변경되었습니다. 저장·검증 후 확정해 주세요.');
  });

  addProductButton.addEventListener('click', () => {
    createProduct();
    invalidateConfirmation();
  });

  productsElement.addEventListener('click', (event) => {
    const productCard = event.target.closest('.product-card');
    if (!productCard) return;

    if (event.target.closest('.add-feature')) {
      createFeature(productCard);
      updatePreview();
      invalidateConfirmation();
      return;
    }

    if (event.target.closest('.remove-feature')) {
      const rows = productCard.querySelectorAll('.feature-row');
      if (rows.length > 1) event.target.closest('.feature-row').remove();
      updateFeatureButtons(productCard);
      updatePreview();
      invalidateConfirmation();
      return;
    }

    if (event.target.closest('.remove-product')) {
      if (productsElement.children.length > 1) productCard.remove();
      refreshProductLabels();
      updatePreview();
      invalidateConfirmation();
    }
  });

  document.querySelector('#load-input').addEventListener('click', () =>
    runAction('기존 데이터를 불러오는 중입니다.', async () => {
      const result = await callApi('/api/input');
      if (!result.exists) {
        return { message: '저장된 입력 데이터가 아직 없습니다.' };
      }
      setInputData(result.input);
      return { message: '기존 데이터를 모든 입력 필드에 불러왔습니다.' };
    }),
  );

  document.querySelector('#save-input').addEventListener('click', () =>
    runAction('입력 내용을 저장하는 중입니다.', async () => {
      const result = await callApi('/api/save', {
        method: 'POST',
        body: JSON.stringify(getInputData()),
      });
      invalidateConfirmation();
      return result;
    }),
  );

  document.querySelector('#validate-input').addEventListener('click', () =>
    runAction('입력 내용을 검증하는 중입니다.', () =>
      callApi('/api/validate', {
        method: 'POST',
        body: JSON.stringify(getInputData()),
      }),
    ),
  );

  document.querySelector('#confirm-input').addEventListener('click', () =>
    runAction('입력 내용을 검증하고 확정하는 중입니다.', async () => {
      const result = await callApi('/api/confirm', {
        method: 'POST',
        body: JSON.stringify(getInputData()),
      });
      confirmedHash = result.confirmedHash;
      previewUrl = undefined;
      return result;
    }),
  );

  generateButton.addEventListener('click', () =>
    runAction(
      'LM Studio로 뉴스레터를 생성하고 HTML을 렌더링하는 중입니다.',
      async () => {
        const result = await callApi('/api/generate', {
          method: 'POST',
          body: JSON.stringify({ confirmedHash }),
        });
        previewUrl = result.previewUrl;
        return result;
      },
    ),
  );

  previewButton.addEventListener('click', () => {
    if (previewUrl) window.open(`${previewUrl}?t=${Date.now()}`, '_blank');
  });

  window.HOSSmartStoreInputUI = {
    getInputData,
    setInputData,
  };
  createProduct();
  updateActionButtons();
})();
