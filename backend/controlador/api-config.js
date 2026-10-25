(() => {
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    const isLiveServer = isLocalhost && window.location.port !== '3443';
    const apiOrigin = isLiveServer
        ? `http://${hostname}:3000`
        : 'https://localhost:3443';

    window.hotelApiUrl = path => new URL(path, apiOrigin).toString();
})();
