import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CustomizerForm } from './components/CustomizerForm';
import { TextureList } from './components/TextureList';

const App = () => {
    const [selectedTextures, setSelectedTextures] = useState<string[]>([]);

    return (
        <div>
            <h1>JG RTX Customizer</h1>
            <CustomizerForm textures={selectedTextures} />
            <hr />
            <TextureList onSelectionChange={setSelectedTextures} />
        </div>
    );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);
