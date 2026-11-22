import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {applyTypographyConfig, loadTypographyConfig} from './utils/typographySettings';

applyTypographyConfig(loadTypographyConfig());

createRoot(document.getElementById('root')!).render(<App />);
