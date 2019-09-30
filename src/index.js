import 'core-js/features/map';
import 'core-js/features/set';
import 'raf/polyfill';
import React from 'react';
import ReactDOM from 'react-dom';
import connect from '@vkontakte/vk-connect';
import App from './App';
//import registerServiceWorker from './sw';

// Init VK  Mini App
connect.send('VKWebAppInit');

ReactDOM.render(<App />, document.getElementById('root'));
