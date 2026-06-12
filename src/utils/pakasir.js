const BASE_API_URL = 'https://app.pakasir.com';

// Fungsi helper disatukan langsung di sini
const sanitizeUrlSafe = (s) => String(s).replace(/[^\w\-_.~0-9]/g, '');

class Pakasir {
  constructor(config) {
    this.config = config;
    this.watchers = new Map();
    this.watchTimeouts = new Map();
    this.lastStatuses = new Map();

    this.initialize();
  }

  initialize() {
    const { slug, apikey } = this.config;

    if (!slug || !apikey) {
      throw new Error('Pakasir config is not valid!');
    }
  }

  getPaymentUrl(method, order_id, amount, redirect_url) {
    order_id = sanitizeUrlSafe(order_id);

    const { slug } = this.config;

    if (order_id?.length < 5) throw new Error('Order ID must be at least 5 characters long!');
    if (amount < 500) throw new Error('Amount must be at least Rp500!');

    let payment_url;
    let payment_number;

    let expired_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    let fee = 0;

    redirect_url = redirect_url || null;

    switch (method) {
      case 'all':
        payment_url = `${BASE_API_URL}/pay/${slug}/${amount}?order_id=${order_id}&redirect=${redirect_url}`;
        break;
      case 'qris':
        fee = amount > 105000 ? Math.round(0.01 * amount) : Math.round(0.007 * amount + 310);
        payment_url = `${BASE_API_URL}/pay/${slug}/${amount}?order_id=${order_id}&redirect=${redirect_url}&qris_only=1`;
        break;
      case 'paypal':
        if (amount < 10000) throw new Error('Amount must be at least Rp10.000!');
        fee = Math.max(Math.round(0.01 * amount), 3000);
        payment_url = `${BASE_API_URL}/paypal/${slug}/${amount}?order_id=${order_id}&redirect=${redirect_url}`;
        break;
      case 'cimb_niaga_va':
      case 'bni_va':
      case 'sampoerna_va':
      case 'bnc_va':
      case 'maybank_va':
      case 'permata_va':
      case 'atm_bersama_va':
      case 'artha_graha_va':
      case 'bri_va':
        fee = (method === 'sampoerna_va' || method === 'artha_graha_va') ? 2000 : 3500;
        payment_url = `${BASE_API_URL}/pay/${slug}/${amount}?order_id=${order_id}&redirect=${redirect_url}&payment_method=${method}`;
        break;
      default:
        throw new Error('Invalid payment method! Only "all", "qris", and "paypal" are allowed!');
    }

    return {
      project: slug,
      order_id,
      amount,
      fee,
      status: 'pending',
      total_payment: amount + fee,
      payment_method: method,
      payment_number,
      payment_url,
      redirect_url,
      expired_at,
      completed_at: null,
    };
  }

  async createPayment(method, order_id, amount, redirect_url) {
    order_id = sanitizeUrlSafe(order_id);

    const payload = this.getPaymentUrl(method, order_id, amount, redirect_url);

    const response = await fetch(`${BASE_API_URL}/api/transactioncreate/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: payload.project,
        api_key: this.config.apikey,
        order_id: payload.order_id,
        amount: payload.amount,
        redirect_url: payload.redirect_url,
      }),
    });

    const json = await response.json();

    if (!json?.data && !json?.payment) {
      throw new Error(json?.message || 'Failed to create payment!');
    }

    return {
      project: payload.project,
      order_id: payload.order_id,
      amount: payload.amount,
      fee: payload.fee,
      status: 'pending',
      total_payment: payload.total_payment,
      payment_method: method,
      payment_number: json.payment.payment_number,
      payment_url: payload.payment_url,
      redirect_url: payload.redirect_url,
      expired_at: json.payment.expired_at,
      completed_at: null,
    };
  }

  async detailPayment(order_id, amount) {
    order_id = sanitizeUrlSafe(order_id);

    const response = await fetch(
      `${BASE_API_URL}/api/transactiondetail?project=${this.config.slug}&amount=${amount}&order_id=${order_id}&api_key=${this.config.apikey}`,
    );

    const json = await response.json();

    if (!json?.data && !json?.transaction) {
      throw new Error(json?.message || 'Failed to get payment detail!');
    }

    const payload = this.getPaymentUrl(json.transaction.payment_method, order_id, amount);

    return {
      project: this.config.slug,
      order_id,
      amount,
      fee: payload.fee,
      status: json.transaction.status,
      total_payment: payload.total_payment,
      payment_method: payload.payment_method,
      payment_number: payload.payment_number,
      payment_url: payload.payment_url,
      redirect_url: payload.redirect_url,
      expired_at: null,
      completed_at: json.transaction.completed_at,
    };
  }

  async cancelPayment(order_id, amount) {
    order_id = sanitizeUrlSafe(order_id);

    const response = await fetch(`${BASE_API_URL}/api/transactioncancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: this.config.slug,
        api_key: this.config.apikey,
        order_id,
        amount,
      }),
    });

    const json = await response.json();

    if (!json?.data && !json?.success) {
      throw new Error(json?.message || 'Failed to cancel payment!');
    }

    const payload = await this.detailPayment(order_id, amount);

    payload.status = 'canceled';

    return payload;
  }

  async simulationPayment(order_id, amount) {
    order_id = sanitizeUrlSafe(order_id);

    const response = await fetch(`${BASE_API_URL}/api/paymentsimulation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: this.config.slug,
        api_key: this.config.apikey,
        order_id,
        amount,
      }),
    });

    const json = await response.json();

    if (!json?.data && !json?.success) {
      throw new Error(json?.message || 'Failed to simulate payment!');
    }

    const payload = await this.detailPayment(order_id, amount);

    payload.status = 'completed';

    return payload;
  }

  watchPayment(order_id, amount, options = {}) {
    order_id = sanitizeUrlSafe(order_id);

    const interval = options.interval || 3000;
    const timeout = options.timeout || 600000;
    const watchKey = `${order_id}_${amount}`;

    this.stopWatch(order_id, amount);

    const timeoutId = setTimeout(() => {
      this.stopWatch(order_id, amount);
    }, timeout);

    this.watchTimeouts.set(watchKey, timeoutId);

    const checkStatus = async () => {
      try {
        const payment = await this.detailPayment(order_id, amount);
        const lastStatus = this.lastStatuses.get(watchKey);

        if (lastStatus !== payment.status) {
          if (options.onStatusChange) {
            options.onStatusChange(payment);
          }
        }

        this.lastStatuses.set(watchKey, payment.status);
      } catch (error) {
        if (options.onError) {
          options.onError(error);
        }
      }
    };

    checkStatus();

    const intervalId = setInterval(checkStatus, interval);
    this.watchers.set(watchKey, intervalId);
  }

  stopWatch(order_id, amount) {
    order_id = sanitizeUrlSafe(order_id);

    const watchKey = `${order_id}_${amount}`;

    const intervalId = this.watchers.get(watchKey);
    if (intervalId) {
      clearInterval(intervalId);
      this.watchers.delete(watchKey);
    }

    const timeoutId = this.watchTimeouts.get(watchKey);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.watchTimeouts.delete(watchKey);
    }

    this.lastStatuses.delete(watchKey);
  }
}

module.exports = { Pakasir };
