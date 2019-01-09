const providers = {
    'luminati': require('./proxy.luminati'),
    'proxy-rotator': require('./proxy.proxy-rotator')
};

module.exports = (provider, company, session) => {return providers[provider](company, session)};