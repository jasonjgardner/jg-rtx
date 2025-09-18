import React, { useState } from 'react';

type CustomizerFormProps = {
    textures: string[];
};

export const CustomizerForm = ({ textures }: CustomizerFormProps) => {
  const [builds, setBuilds] = useState(['RTX', 'VV']);
  const [includeSubpacks, setIncludeSubpacks] = useState(true);
  const [subpackRes, setSubpackRes] = useState([128, 64, 32]);
  const [nameRTX, setNameRTX] = useState('JG RTX (RTX)');
  const [nameVV, setNameVV] = useState('JG RTX (Vibrant Visuals)');
  const [isBuilding, setIsBuilding] = useState(false);
  const [zipPaths, setZipPaths] = useState<string[]>([]);

  const handleBuildChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value, checked } = e.target;
    if (checked) {
      setBuilds([...builds, value]);
    } else {
      setBuilds(builds.filter((b) => b !== value));
    }
  };

  const handleSubpackResChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value, checked } = e.target;
    const res = parseInt(value, 10);
    if (checked) {
      setSubpackRes([...subpackRes, res]);
    } else {
      setSubpackRes(subpackRes.filter((r) => r !== res));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsBuilding(true);
    setZipPaths([]);
    const options = {
      builds,
      includeSubpacks,
      subpackRes,
      nameRTX,
      nameVV,
      textures,
    };

    try {
      const response = await fetch('/build', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options),
      });
      const data = await response.json();
      if (response.ok) {
        alert(data.message);
        setZipPaths(data.zipPaths);
      } else {
        alert(`Build failed: ${data.message}`);
      }
    } catch (error) {
      console.error(error);
      alert('Build failed. See console for details.');
    } finally {
      setIsBuilding(false);
    }
  };

  return (
    <div>
        <form onSubmit={handleSubmit}>
        <h2>Build Options</h2>

        <div>
            <h3>Build Variants</h3>
            <label>
            <input type="checkbox" value="RTX" checked={builds.includes('RTX')} onChange={handleBuildChange} />
            RTX
            </label>
            <label>
            <input type="checkbox" value="VV" checked={builds.includes('VV')} onChange={handleBuildChange} />
            Vibrant Visuals
            </label>
        </div>

        <div>
            <h3>Subpacks</h3>
            <label>
            <input type="checkbox" checked={includeSubpacks} onChange={(e) => setIncludeSubpacks(e.target.checked)} />
            Include Subpacks
            </label>
            {includeSubpacks && (
            <div>
                <h4>Resolutions</h4>
                <label>
                <input type="checkbox" value="128" checked={subpackRes.includes(128)} onChange={handleSubpackResChange} />
                128x
                </label>
                <label>
                <input type="checkbox" value="64" checked={subpackRes.includes(64)} onChange={handleSubpackResChange} />
                64x
                </label>
                <label>
                <input type="checkbox" value="32" checked={subpackRes.includes(32)} onChange={handleSubpackResChange} />
                32x
                </label>
            </div>
            )}
        </div>

        <div>
            <h3>Pack Names</h3>
            <label>
            RTX Pack Name:
            <input type="text" value={nameRTX} onChange={(e) => setNameRTX(e.target.value)} />
            </label>
            <br />
            <label>
            Vibrant Visuals Pack Name:
            <input type="text" value={nameVV} onChange={(e) => setNameVV(e.target.value)} />
            </label>
        </div>

        <br />
        <button type="submit" disabled={isBuilding}>
            {isBuilding ? 'Building...' : 'Build'}
        </button>
        </form>
        {zipPaths.length > 0 && (
            <div>
                <h3>Downloads</h3>
                <ul>
                    {zipPaths.map(p => (
                        <li key={p}>
                            <a href={`/${p}`} download>{p.split('/').pop()}</a>
                        </li>
                    ))}
                </ul>
            </div>
        )}
    </div>
  );
};
