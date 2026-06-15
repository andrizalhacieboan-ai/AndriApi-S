document.addEventListener('DOMContentLoaded', async () => {
    const loadingScreen = document.getElementById("loadingScreen");
    const body = document.body;
    body.classList.add("no-scroll");

    // Cek apakah user sudah login (session)
    let isLoggedIn = false;
    let userPlan = 'free';
    let userApiKey = ''; // 🔥 Variabel global penampung API Key

    try {
        const me = await fetch('/api/auth/me', { credentials: 'include' });
        const data = await me.json();
        if (data.status) {
            isLoggedIn = true;
            userPlan = data.data.plan;
            console.log('Logged in as', data.data.name);

            // 🔥 LANGSUNG AMBIL DARI PROFILE USER YANG SUDAH GENERATED
            // Menyesuaikan apakah nama field di database/profile-mu 'apikey' atau 'api_key'
            userApiKey = data.data.apikey || data.data.api_key || ''; 
            console.log('🔒 Auto-inject API Key dari profile sukses!');

        } else {
            // Redirect ke login jika belum login
            window.location.href = '/login';
            return;
        }
    } catch(e) {
        window.location.href = '/login';
        return;
    }

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
                const methodClass = (item.method || 'GET').toLowerCase();
                return `
                <div class="col-md-6 col-lg-4 api-item ${isLastItem ? 'mb-4' : 'mb-2'}"
                     data-name="${item.name}" data-desc="${item.desc || ''}">
                    <div class="hero-section d-flex align-items-center justify-content-between" style="height:70px;">
                        <div>
                            <h5 class="mb-0" style="font-size:18px;">${item.name}</h5>
                            <p class="text-muted mb-0" style="font-size:0.8rem;">${item.desc || ''}</p>
                        </div>
                        <button class="btn btn-dark btn-sm try-api-btn"
                            data-method="${item.method || 'GET'}"
                            data-path="${item.path}"
                            data-name="${item.name}"
                            data-desc="${item.desc || ''}"
                            data-inner-desc="${item.innerDesc || ''}"
                            data-params='${JSON.stringify(item.params || [])}'>
                            ${item.method || 'GET'}
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

        // ── Try API button click ──────────────────────────────────────────────
        document.addEventListener('click', async event => {
            const btn = event.target.closest('.try-api-btn');
            if (!btn) return;

            const method = btn.dataset.method;
            const apiPath = btn.dataset.path;
            const apiName = btn.dataset.name;
            const apiDesc = btn.dataset.desc;
            const innerDesc = btn.dataset.innerDesc;
            const params = JSON.parse(btn.dataset.params || '[]');

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

            // Reset modal
            refs.label.textContent = apiName;
            refs.desc.textContent = apiDesc;
            refs.content.textContent = '';
            refs.endpoint.textContent = '';
            refs.spinner.classList.add('d-none');
            refs.content.classList.add('d-none');
            refs.endpoint.classList.add('d-none');
            refs.inputWrap.innerHTML = '';
            refs.submitBtn.classList.remove('d-none');
            refs.submitBtn.disabled = false;
            refs.submitBtn.textContent = `Execute ${method}`;

            // Jika ada parameter yang perlu diisi user (dari settings item.params)
            if (params.length > 0) {
                const container = document.createElement('div');
                container.className = 'param-container';
                params.forEach((p, idx) => {
                    const group = document.createElement('div');
                    group.className = 'mb-2';
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.className = 'form-control';
                    input.placeholder = `${p.name} ${p.required ? '(wajib)' : '(opsional)'}`;
                    input.dataset.param = p.name;
                    input.required = p.required || false;
                    
                    // 🔥 Otomatis isi jika input adalah parameter apikey
                    if (p.name.toLowerCase() === 'apikey' && userApiKey) {
                        input.value = userApiKey;
                    }

                    if (p.required) input.addEventListener('input', validateInputs);
                    group.appendChild(input);
                    container.appendChild(group);
                });
                if (innerDesc) {
                    const info = document.createElement('div');
                    info.className = 'text-muted small mt-2';
                    info.innerHTML = innerDesc;
                    container.appendChild(info);
                }
                refs.inputWrap.appendChild(container);
                refs.submitBtn.onclick = () => {
                    const inputs = refs.inputWrap.querySelectorAll('input');
                    let valid = true;
                    const paramValues = {};
                    inputs.forEach(inp => {
                        if (inp.required && !inp.value.trim()) {
                            valid = false;
                            inp.classList.add('is-invalid');
                        } else {
                            inp.classList.remove('is-invalid');
                            if (inp.value.trim()) paramValues[inp.dataset.param] = inp.value.trim();
                        }
                    });
                    if (!valid) return;

                    executeApiRequest(method, apiPath, paramValues, refs);
                };
            } else {
                // No parameters needed
                refs.inputWrap.innerHTML = '<div class="alert alert-info">Tidak ada parameter yang diperlukan. Klik Execute.</div>';
                refs.submitBtn.onclick = () => {
                    executeApiRequest(method, apiPath, {}, refs);
                };
            }

            modal.show();
        });

        function validateInputs() {
            const requiredInputs = document.querySelectorAll('.param-container input[required]');
            const submitBtn = document.getElementById('submitQueryBtn');
            if (submitBtn) {
                submitBtn.disabled = !Array.from(requiredInputs).every(i => i.value.trim() !== '');
            }
        }

        async function executeApiRequest(method, path, params, refs) {
            refs.spinner.classList.remove('d-none');
            refs.content.classList.add('d-none');
            refs.endpoint.classList.add('d-none');
            refs.submitBtn.disabled = true;

            // 🔥 Otomatis pasang apikey dari profile jika belum ada di objek parameter
            if (userApiKey && !params.apikey) {
                params.apikey = userApiKey;
            }

            let url = path;
            let options = {
                method: method,
                credentials: 'include', // kirim cookie session
                headers: {
                    'Content-Type': 'application/json'
                }
            };

            if (method.toUpperCase() === 'GET') {
                const query = new URLSearchParams(params).toString();
                if (query) url += '?' + query;
            } else {
                options.body = JSON.stringify(params);
            }

            // 🔥 Cetak full url absolut beserta domainnya agar mudah di-copy untuk curl/bot
            const absoluteUrl = `${window.location.origin}${url}`;
            refs.endpoint.textContent = `${method} ${absoluteUrl}`;
            refs.endpoint.classList.remove('d-none');

            try {
                const response = await fetch(url, options);
                const contentType = response.headers.get('Content-Type') || '';

                if (contentType.startsWith('image/')) {
                    const blob = await response.blob();
                    const img = document.createElement('img');
                    img.src = URL.createObjectURL(blob);
                    img.alt = refs.label.textContent;
                    img.style.maxWidth = '100%';
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
                refs.submitBtn.disabled = false;
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
