import React from 'react';
import ReactDOM from 'react-dom/client';
import { setupIonicReact } from '@ionic/react';

import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import '@ionic/react/css/padding.css';
import '@ionic/react/css/float-elements.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/text-transformation.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';
import '@ionic/react/css/palettes/dark.system.css';
// Bengali titles are the primary text in this app, not decoration. The system
// stack only renders them when the OS happens to ship a Bengali font — which
// many Windows installs and low-end Android builds do not, and which produced
// empty boxes during verification. Self-hosting the Bengali subset (44 KB per
// weight) makes every chapter title render the same everywhere, offline.
import '@fontsource/noto-sans-bengali/400.css';
import '@fontsource/noto-sans-bengali/600.css';
import './styles/theme.css';

import { App } from './app/App';

setupIonicReact({ mode: 'md' });

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
