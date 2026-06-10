document.addEventListener('DOMContentLoaded', async () => {
    const loadingScreen = document.getElementById("loadingScreen");
    const body = document.body;
    body.classList.add("no-scroll");

    try {
        const settings = await fetch('/src/settings.json').then(res => res.json());

        const setContent = (id, property, value) => {
            const element = document.getElementById(id);
            if (element) element[property] = value;
        };

        const randomImageSrc =
            Array.isArray(settings.header.imageSrc) && settings.header.imageSrc.length > 0
                ? settings.header.imageSrc[Math.floor(Math.random() * settings.header.imageSrc.length)]
                : "";

        const dynamicImage = document.getElementById('dynamicImage');
        if (dynamicImage) {
            dynamicImage.src = randomImageSrc;
            const setImageSize = () => {
                const w = window.innerWidth;
                dynamicImage.style.maxWidth = w < 768
                    ? settings.header.imageSize.mobile || "80%"
                    : w < 1200
                        ? settings.header.imageSize.tablet || "40%"
                        : settings.header.imageSize.desktop || "40%";
                dynamicImage.style.height = "auto";
            };
            setImageSize();
            window.addEventListener('resize', setImageSize);
        }

        setContent('page',          'textContent', settings.name        || "Andri API");
        setContent('header',        'textContent', settings.name        || "Andri API");
        setContent('name',          'textContent', settings.name        || "Andri API");
        setContent('version',       'textContent', settings.version     || "v1.0");
        setContent('versionHeader', 'textContent', settings.header.status || "Online!");
        setContent('description',   'textContent', settings.description || "Simple API's");

        const apiLinksContainer = document.getElementById('apiLinks');
        if (apiLinksContainer && settings.links?.length) {
            settings.links.forEach(({ url, name }) => {
                const link = Object.assign(document.createElement('a'), {
                    href: url, textContent: name, target: '_blank', className: 'lead'
                });
                apiLinksContainer.appendChild(link);
            });
        }

        // ── Render categories ─────────────────────────────────────────────────
        const apiContent = document.getElementById('apiContent');
        settings.categories.forEach((category) => {
            const sortedItems = [...category.items].sort((a, b) => a.name.localeCompare(b.name));
            const categoryContent = sortedItems.map((item, index, array) => {
                const isLastItem = index === array.length - 1;
                return `
                <div class="col-md-6 col-lg-4 api-item ${isLastItem ? 'mb-4' : 'mb-2'}"
                     data-name="${item.name}" data-desc="${item.desc || ''}">
                    <div class="hero-section d-flex align-items-center justify-content-between" style="height:70px;">
                        <div>
                            <h5 class="mb-0" style="font-size:18px;">${item.name}</h5>
                            <p class="text-muted mb-0" style="font-size:0.8rem;">${item.desc || ''}</p>
                        </div>
                        <button class="btn btn-dark btn-sm get-api-btn"
                            data-api-path="${item.path}"
                            data-api-name="${item.name}"
                            data-api-desc="${item.desc || ''}"
                            data-inner-desc="${item.innerDesc || ''}">
                            GET
                        </button>
                    </div>
                </div>`;
            }).join('');
            apiContent.insertAdjacentHTML('beforeend',
                `<h3 class="mb-3 category-header" style="font-size:22px;">${category.name}</h3>
                 <div class="row">${categoryContent}</div>`);
        });

        // ── Search ────────────────────────────────────────────────────────────
        document.getElementById('searchInput').addEventListener('input', function () {
            const term = this.value.toLowerCase();
            document.querySelectorAll('.api-item').forEach(item => {
                const match = item.dataset.name.toLowerCase().includes(term)
                           || item.dataset.desc.toLowerCase().includes(term);
                item.style.display = match ? '' : 'none';
            });
            document.querySelectorAll('.category-header').forEach(h => {
                const visible = h.nextElementSibling?.querySelectorAll('.api-item:not([style*="display: none"])');
                h.style.display = (visible && visible.length) ? '' : 'none';
            });
        });

        // ── GET button click ──────────────────────────────────────────────────
        document.addEventListener('click', event => {
            const btn = event.target.closest('.get-api-btn');
            if (!btn) return;

            const { apiPath, apiName, apiDesc, innerDesc } = btn.dataset;

            const modal = new bootstrap.Modal(document.getElementById('apiResponseModal'));
            const refs = {
                label:      document.getElementById('apiResponseModalLabel'),
                desc:       document.getElementById('apiResponseModalDesc'),
                content:    document.getElementById('apiResponseContent'),
                endpoint:   document.getElementById('apiEndpoint'),
                spinner:    document.getElementById('apiResponseLoading'),
                inputWrap:  document.getElementById('apiQueryInputContainer'),
                submitBtn:  document.getElementById('submitQueryBtn'),
            };

            // Reset modal state
            refs.label.textContent   = apiName;
            refs.desc.textContent    = apiDesc;
            refs.content.textContent = '';
            refs.endpoint.textContent = '';
            refs.spinner.classList.add('d-none');
            refs.content.classList.add('d-none');
            refs.endpoint.classList.add('d-none');
            refs.inputWrap.innerHTML = '';
            refs.submitBtn.classList.add('d-none');
            refs.submitBtn.disabled  = false;

            // Parse params from path (keys with empty string value = required input)
            // e.g. "/api/ai/luminai?text=" → param "text" needs input
            const [basePath, queryStr] = apiPath.split('?');
            const params = queryStr ? new URLSearchParams(queryStr) : new URLSearchParams();

            // Find params that need user input (value is empty)
            const inputParams = [];
            params.forEach((val, key) => { if (val === '') inputParams.push(key); });

            // Also add apikey field always
            const needApiKey = true;

            if (inputParams.length > 0 || needApiKey) {
                const paramContainer = document.createElement('div');
                paramContainer.className = 'param-container';

                // Input fields for query params
                inputParams.forEach((param, i) => {
                    const group = document.createElement('div');
                    group.className = i < inputParams.length - 1 ? 'mb-2' : 'mb-2';

                    const input = document.createElement('input');
                    input.type        = 'text';
                    input.className   = 'form-control';
                    input.placeholder = `Enter ${param}...`;
                    input.dataset.param = param;
                    input.required    = true;
                    input.addEventListener('input', validateInputs);

                    group.appendChild(input);
                    paramContainer.appendChild(group);
                });

                // API Key field
                const apikeyGroup = document.createElement('div');
                apikeyGroup.className = 'mb-2';
                const apikeyInput = document.createElement('input');
                apikeyInput.type        = 'text';
                apikeyInput.className   = 'form-control';
                apikeyInput.placeholder = 'API Key (opsional untuk Free)';
                apikeyInput.dataset.param = 'apikey';
                apikeyInput.addEventListener('input', validateInputs);
                apikeyGroup.appendChild(apikeyInput);
                paramContainer.appendChild(apikeyGroup);

                // innerDesc
                if (innerDesc) {
                    const descDiv = document.createElement('div');
                    descDiv.className   = 'text-muted mt-2';
                    descDiv.style.fontSize = '13px';
                    descDiv.innerHTML   = innerDesc.replace(/\n/g, '<br>');
                    paramContainer.appendChild(descDiv);
                }

                refs.inputWrap.appendChild(paramContainer);
                refs.submitBtn.classList.remove('d-none');

                refs.submitBtn.onclick = () => {
                    const inputs = refs.inputWrap.querySelectorAll('input');
                    const newParams = new URLSearchParams();
                    let valid = true;

                    inputs.forEach(inp => {
                        if (inp.dataset.param !== 'apikey' && !inp.value.trim()) {
                            valid = false;
                            inp.classList.add('is-invalid');
                        } else {
                            inp.classList.remove('is-invalid');
                            if (inp.value.trim()) newParams.append(inp.dataset.param, inp.value.trim());
                        }
                    });

                    if (!valid) return;

                    // Build final URL
                    const finalUrl = `${window.location.origin}${basePath}?${newParams.toString()}`;
                    refs.inputWrap.innerHTML = '';
                    refs.submitBtn.classList.add('d-none');
                    handleApiRequest(finalUrl, refs, apiName);
                };
            } else {
                // No params needed — hit directly
                const finalUrl = `${window.location.origin}${basePath}`;
                handleApiRequest(finalUrl, refs, apiName);
            }

            modal.show();
        });

        function validateInputs() {
            const inputs = document.querySelectorAll('.param-container input[required]');
            document.getElementById('submitQueryBtn').disabled =
                !Array.from(inputs).every(i => i.value.trim() !== '');
        }

        async function handleApiRequest(apiUrl, refs, apiName) {
            refs.spinner.classList.remove('d-none');
            refs.content.classList.add('d-none');

            try {
                const response = await fetch(apiUrl);
                const contentType = response.headers.get('Content-Type') || '';

                refs.endpoint.textContent = apiUrl;
                refs.endpoint.classList.remove('d-none');

                if (contentType.startsWith('image/')) {
                    const blob = await response.blob();
                    const img  = document.createElement('img');
                    img.src           = URL.createObjectURL(blob);
                    img.alt           = apiName;
                    img.style.maxWidth   = '100%';
                    img.style.height     = 'auto';
                    img.style.borderRadius = '5px';
                    refs.content.innerHTML = '';
                    refs.content.appendChild(img);
                } else {
                    const data = await response.json();
                    refs.content.textContent = JSON.stringify(data, null, 2);
                }
            } catch (err) {
                refs.content.textContent = `Error: ${err.message}`;
            } finally {
                refs.spinner.classList.add('d-none');
                refs.content.classList.remove('d-none');
            }
        }

    } catch (err) {
        console.error('Error loading settings:', err);
    } finally {
        setTimeout(() => {
            loadingScreen.style.display = "none";
            body.classList.remove("no-scroll");
        }, 2000);
    }
});

window.addEventListener('scroll', () => {
    const navbar    = document.querySelector('.navbar');
    const navBrand  = document.querySelector('.navbar-brand');
    if (window.scrollY > 0) {
        navBrand?.classList.add('visible');
        navbar?.classList.add('scrolled');
    } else {
        navBrand?.classList.remove('visible');
        navbar?.classList.remove('scrolled');
    }
});
