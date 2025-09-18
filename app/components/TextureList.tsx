import React, { useState, useEffect } from 'react';

type TextureListProps = {
    onSelectionChange: (selectedTextures: string[]) => void;
};

export const TextureList = ({ onSelectionChange }: TextureListProps) => {
    const [textures, setTextures] = useState<string[]>([]);
    const [selectedTextures, setSelectedTextures] = useState<string[]>([]);

    useEffect(() => {
        const fetchTextures = async () => {
            try {
                const response = await fetch('/api/textures');
                const data = await response.json();
                setTextures(data);
                setSelectedTextures(data); // By default, all textures are selected
                onSelectionChange(data);
            } catch (error) {
                console.error('Failed to fetch textures:', error);
            }
        };
        fetchTextures();
    }, []);

    const handleTextureToggle = (texture: string) => {
        const newSelection = selectedTextures.includes(texture)
            ? selectedTextures.filter(t => t !== texture)
            : [...selectedTextures, texture];
        setSelectedTextures(newSelection);
        onSelectionChange(newSelection);
    };

    return (
        <div>
            <h3>Select Textures</h3>
            <div id="texture-list">
                {textures.map(texture => (
                    <div key={texture} onClick={() => handleTextureToggle(texture)} style={{ cursor: 'pointer', border: selectedTextures.includes(texture) ? '2px solid blue' : '2px solid transparent', padding: '5px' }}>
                        <img src={`/textures/${texture}?thumbnail=true`} alt={texture} title={texture} />
                        <p style={{ textAlign: 'center', margin: '0.5em 0', wordBreak: 'break-all' }}>{texture.split('/').pop()}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};
