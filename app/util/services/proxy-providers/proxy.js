const providers = {
    'luminati': require('./proxy.luminati'),
    'proxy-rotator': require('./proxy.proxy-rotator')
};

module.exports = (provider, company) => {return providers[provider](company)};