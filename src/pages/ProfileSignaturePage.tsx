import { useEffect, useRef, useState } from 'react';
import { Upload, Save, FileSignature, RefreshCw } from 'lucide-react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';

interface ProfileSignaturePageProps {
  menuTitle?: string;
}

function ProfileSignaturePage({ menuTitle = 'Ma signature' }: ProfileSignaturePageProps) {
  const { agent } = useAuth();
  const { success, error } = useToast();
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [sealFile, setSealFile] = useState<File | null>(null);
  const [signaturePreview, setSignaturePreview] = useState<string>('');
  const [sealPreview, setSealPreview] = useState<string>('');
  const [savedSignatureUrl, setSavedSignatureUrl] = useState<string>('');
  const [customText, setCustomText] = useState('Validé électroniquement');
  const [saving, setSaving] = useState(false);
  const previewAreaRef = useRef<HTMLDivElement | null>(null);
  const [activeDrag, setActiveDrag] = useState<'text' | 'signature' | 'seal' | null>(null);
  const [activeResize, setActiveResize] = useState<{
    element: 'text' | 'signature' | 'seal';
    handle: 'se' | 'nw';
  } | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [layout, setLayout] = useState({
    text: { x: 6, y: 8, w: 48, h: 18 },
    signature: { x: 8, y: 42, w: 44, h: 36 },
    seal: { x: 66, y: 38, w: 24, h: 42 }
  });
  const [sizes, setSizes] = useState({
    text: 100,
    signature: 100,
    seal: 100
  });

  useEffect(() => {
    const loadCurrentSignature = async () => {
      if (!agent?.ID) return;

      const { data, error: fetchError } = await supabase
        .from('AGENTS')
        .select('signature')
        .eq('ID', agent.ID)
        .single();

      if (!fetchError && data?.signature) {
        setSavedSignatureUrl(data.signature);
      }
    };

    loadCurrentSignature();
  }, [agent?.ID]);

  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>, type: 'signature' | 'seal') => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      error('Veuillez sélectionner une image.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const imageData = String(reader.result || '');
      const transparentData = await makeImageBackgroundTransparent(imageData);
      if (type === 'signature') {
        setSignatureFile(file);
        setSignaturePreview(transparentData);
      } else {
        setSealFile(file);
        setSealPreview(transparentData);
      }
    };
    reader.readAsDataURL(file);
  };

  const makeImageBackgroundTransparent = async (dataUrl: string): Promise<string> => {
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imageData.data;

        // Supprime les pixels quasi-blancs (scans/signatures avec fond papier)
        // pour obtenir un fond réellement transparent.
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i];
          const g = d[i + 1];
          const b = d[i + 2];
          const a = d[i + 3];
          const isNearWhite = r > 238 && g > 238 && b > 238;
          if (a > 0 && isNearWhite) {
            d[i + 3] = 0;
          }
        }

        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  };

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const startDrag = (element: 'text' | 'signature' | 'seal', e: React.MouseEvent<HTMLDivElement>) => {
    if (!previewAreaRef.current) return;
    const rect = previewAreaRef.current.getBoundingClientRect();
    const el = layout[element];
    const currentLeft = (el.x / 100) * rect.width;
    const currentTop = (el.y / 100) * rect.height;
    setDragOffset({ x: e.clientX - rect.left - currentLeft, y: e.clientY - rect.top - currentTop });
    setActiveDrag(element);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((!activeDrag && !activeResize) || !previewAreaRef.current) return;
    const rect = previewAreaRef.current.getBoundingClientRect();
    const targetKey = activeResize?.element || activeDrag;
    if (!targetKey) return;
    const el = layout[targetKey];

    if (activeResize) {
      const minW = 10;
      const minH = 10;
      const maxW = 88;
      const maxH = 88;
      const keepRatio = activeResize.element === 'signature' || activeResize.element === 'seal';
      const ratio = el.w / Math.max(el.h, 0.0001);

      setLayout((prev) => {
        const current = prev[activeResize.element];
        const rightEdge = current.x + current.w;
        const bottomEdge = current.y + current.h;
        let nextX = current.x;
        let nextY = current.y;
        let nextW = current.w;
        let nextH = current.h;

        if (activeResize.handle === 'se') {
          nextW = ((e.clientX - rect.left) / rect.width) * 100 - current.x;
          nextH = ((e.clientY - rect.top) / rect.height) * 100 - current.y;
        } else {
          nextW = rightEdge - ((e.clientX - rect.left) / rect.width) * 100;
          nextH = bottomEdge - ((e.clientY - rect.top) / rect.height) * 100;
        }

        nextW = clamp(nextW, minW, maxW);
        nextH = clamp(nextH, minH, maxH);

        if (keepRatio) {
          if (nextW / Math.max(nextH, 0.0001) > ratio) {
            nextW = nextH * ratio;
          } else {
            nextH = nextW / ratio;
          }
        }

        if (activeResize.handle === 'nw') {
          nextX = rightEdge - nextW;
          nextY = bottomEdge - nextH;
        }

        nextX = clamp(nextX, 0, 100 - nextW);
        nextY = clamp(nextY, 0, 100 - nextH);

        return {
          ...prev,
          [activeResize.element]: {
            ...current,
            x: nextX,
            y: nextY,
            w: nextW,
            h: nextH
          }
        };
      });
      return;
    }

    const maxX = 100 - el.w;
    const maxY = 100 - el.h;

    const nextX = ((e.clientX - rect.left - dragOffset.x) / rect.width) * 100;
    const nextY = ((e.clientY - rect.top - dragOffset.y) / rect.height) * 100;

    setLayout((prev) => ({
      ...prev,
      [targetKey]: {
        ...prev[targetKey],
        x: clamp(nextX, 0, maxX),
        y: clamp(nextY, 0, maxY)
      }
    }));
  };

  const stopDrag = () => {
    setActiveDrag(null);
    setActiveResize(null);
  };

  const applyScale = (element: 'text' | 'signature' | 'seal', scale: number) => {
    const safeScale = clamp(scale, 50, 220);
    setSizes((prev) => ({ ...prev, [element]: safeScale }));

    const bases = {
      text: { w: 48, h: 18 },
      signature: { w: 44, h: 36 },
      seal: { w: 24, h: 42 }
    };

    const nextW = (bases[element].w * safeScale) / 100;
    const nextH = (bases[element].h * safeScale) / 100;

    setLayout((prev) => {
      const current = prev[element];
      const maxX = 100 - nextW;
      const maxY = 100 - nextH;
      return {
        ...prev,
        [element]: {
          ...current,
          w: nextW,
          h: nextH,
          x: clamp(current.x, 0, Math.max(0, maxX)),
          y: clamp(current.y, 0, Math.max(0, maxY))
        }
      };
    });
  };

  const previewCard = (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
        <p className="text-xs text-gray-500 mb-2">Aperçu de l'image qui sera enregistrée</p>
        <div
          ref={previewAreaRef}
          className="relative border border-dashed border-gray-300 rounded-lg bg-gray-50 min-h-72 overflow-hidden select-none"
          onMouseMove={handleMouseMove}
          onMouseUp={stopDrag}
          onMouseLeave={stopDrag}
        >
          <div className="absolute inset-0 p-2 text-[10px] text-gray-400 pointer-events-none">
            Déplacez librement les éléments (superposition autorisée)
          </div>

          <div
            onMouseDown={(e) => startDrag('text', e)}
            className="absolute bg-white/95 border border-blue-200 rounded px-2 py-1 cursor-move shadow-sm"
            style={{
              left: `${layout.text.x}%`,
              top: `${layout.text.y}%`,
              width: `${layout.text.w}%`,
              minHeight: `${layout.text.h}%`,
              zIndex: 20
            }}
          >
            <div className="text-xs text-gray-800 break-words whitespace-pre-wrap">{customText || 'Votre texte personnalisé'}</div>
          </div>

          <div
            onMouseDown={(e) => startDrag('signature', e)}
            onWheel={(e) => {
              e.preventDefault();
              const delta = e.deltaY > 0 ? -4 : 4;
              applyScale('signature', sizes.signature + delta);
            }}
            className={`absolute rounded flex items-center justify-center overflow-hidden cursor-move ${
              activeDrag === 'signature' ? 'ring-2 ring-blue-400 bg-blue-50/20' : 'bg-transparent'
            }`}
            style={{
              left: `${layout.signature.x}%`,
              top: `${layout.signature.y}%`,
              width: `${layout.signature.w}%`,
              height: `${layout.signature.h}%`,
              zIndex: 30
            }}
          >
            {signaturePreview ? (
              <img src={signaturePreview} alt="Signature preview" className="max-h-full max-w-full object-contain pointer-events-none" />
            ) : (
              <span className="text-xs text-gray-400 text-center px-2">Image signature</span>
            )}
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setActiveResize({ element: 'signature', handle: 'nw' });
              }}
              className="absolute -top-1.5 -left-1.5 w-3 h-3 rounded-full bg-white border border-blue-600 cursor-nwse-resize"
            />
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setActiveResize({ element: 'signature', handle: 'se' });
              }}
              className="absolute -bottom-1.5 -right-1.5 w-3 h-3 rounded-full bg-blue-600 border border-white cursor-nwse-resize"
            />
          </div>

          <div
            onMouseDown={(e) => startDrag('seal', e)}
            onWheel={(e) => {
              e.preventDefault();
              const delta = e.deltaY > 0 ? -4 : 4;
              applyScale('seal', sizes.seal + delta);
            }}
            className={`absolute rounded-full flex items-center justify-center overflow-hidden cursor-move ${
              activeDrag === 'seal' ? 'ring-2 ring-blue-400 bg-blue-50/20' : 'bg-transparent'
            }`}
            style={{
              left: `${layout.seal.x}%`,
              top: `${layout.seal.y}%`,
              width: `${layout.seal.w}%`,
              height: `${layout.seal.h}%`,
              zIndex: 40
            }}
          >
            {sealPreview ? (
              <img src={sealPreview} alt="Seal preview" className="max-h-full max-w-full object-contain pointer-events-none" />
            ) : (
              <span className="text-xs text-gray-400 text-center px-2">Image sceau</span>
            )}
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setActiveResize({ element: 'seal', handle: 'nw' });
              }}
              className="absolute -top-1.5 -left-1.5 w-3 h-3 rounded-full bg-white border border-blue-600 cursor-nwse-resize"
            />
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setActiveResize({ element: 'seal', handle: 'se' });
              }}
              className="absolute -bottom-1.5 -right-1.5 w-3 h-3 rounded-full bg-blue-600 border border-white cursor-nwse-resize"
            />
          </div>
        </div>
      </div>
  );

  const generateCompositeImage = async (): Promise<Blob> => {
    const previewRect = previewAreaRef.current?.getBoundingClientRect();
    const qualityScale = 2;
    const baseWidth = Math.max(600, Math.round((previewRect?.width || 600) * qualityScale));
    const baseHeight = Math.max(320, Math.round((previewRect?.height || 320) * qualityScale));

    const canvas = document.createElement('canvas');
    canvas.width = baseWidth;
    canvas.height = baseHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas non disponible.');

    // Fond transparent pour un rendu propre sur la facture
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const textX = (layout.text.x / 100) * canvas.width;
    const textY = (layout.text.y / 100) * canvas.height;
    const textW = (layout.text.w / 100) * canvas.width;
    const textH = (layout.text.h / 100) * canvas.height;
    const signatureX = (layout.signature.x / 100) * canvas.width;
    const signatureY = (layout.signature.y / 100) * canvas.height;
    const signatureW = (layout.signature.w / 100) * canvas.width;
    const signatureH = (layout.signature.h / 100) * canvas.height;
    const sealX = (layout.seal.x / 100) * canvas.width;
    const sealY = (layout.seal.y / 100) * canvas.height;
    const sealW = (layout.seal.w / 100) * canvas.width;
    const sealH = (layout.seal.h / 100) * canvas.height;

    const textValue = customText || 'Validé électroniquement';
    const textLines = textValue.split('\n').slice(0, 5);
    const textPadding = Math.max(4, Math.round(textH * 0.08));
    const availableHeight = Math.max(12, textH - textPadding * 2);
    const lineCount = Math.max(1, textLines.length);
    // Auto-fit strict: adapte la police à la box (largeur + hauteur)
    // pour éviter tout texte visuellement trop grand dans le rendu final.
    let fontSize = Math.max(8, Math.min(28, (availableHeight / lineCount) * 0.42));
    const minFontSize = 7;
    const maxTextWidth = Math.max(20, textW - textPadding * 2);
    while (fontSize > minFontSize) {
      ctx.font = `600 ${fontSize}px Inter, Arial, sans-serif`;
      const widestLine = textLines.reduce((max, line) => Math.max(max, ctx.measureText(line || ' ').width), 0);
      const candidateLineHeight = fontSize * 1.12;
      const totalHeight = candidateLineHeight * lineCount;
      if (widestLine <= maxTextWidth && totalHeight <= availableHeight) break;
      fontSize -= 0.5;
    }
    const lineHeight = fontSize * 1.12;

    ctx.save();
    ctx.beginPath();
    ctx.rect(textX, textY, textW, textH);
    ctx.clip();
    ctx.fillStyle = '#111827';
    ctx.font = `600 ${fontSize}px Inter, Arial, sans-serif`;
    ctx.textBaseline = 'top';
    textLines.forEach((line, index) => {
      const drawY = textY + textPadding + index * lineHeight;
      ctx.fillText(line, textX + textPadding, drawY, Math.max(20, textW - textPadding * 2));
    });
    ctx.restore();

    const loadImage = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });

    const drawImageContain = (
      image: HTMLImageElement,
      x: number,
      y: number,
      boxW: number,
      boxH: number
    ) => {
      const imageRatio = image.width / image.height;
      const boxRatio = boxW / boxH;

      let drawW = boxW;
      let drawH = boxH;

      if (imageRatio > boxRatio) {
        drawH = boxW / imageRatio;
      } else {
        drawW = boxH * imageRatio;
      }

      const drawX = x + (boxW - drawW) / 2;
      const drawY = y + (boxH - drawH) / 2;
      ctx.drawImage(image, drawX, drawY, drawW, drawH);
    };

    if (signaturePreview) {
      const img = await loadImage(signaturePreview);
      drawImageContain(img, signatureX, signatureY, signatureW, signatureH);
    }

    if (sealPreview) {
      const img = await loadImage(sealPreview);
      drawImageContain(img, sealX, sealY, sealW, sealH);
    }

    // Recadrer automatiquement au contenu pour éviter un grand rectangle vide
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const alpha = data[(y * canvas.width + x) * 4 + 3];
        if (alpha > 0) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    let outputCanvas = canvas;
    if (maxX >= 0 && maxY >= 0) {
      const padding = 2;
      const cropX = Math.max(0, minX - padding);
      const cropY = Math.max(0, minY - padding);
      const cropW = Math.min(canvas.width - cropX, maxX - minX + 1 + padding * 2);
      const cropH = Math.min(canvas.height - cropY, maxY - minY + 1 + padding * 2);

      const trimmedCanvas = document.createElement('canvas');
      trimmedCanvas.width = cropW;
      trimmedCanvas.height = cropH;
      const trimmedCtx = trimmedCanvas.getContext('2d');
      if (trimmedCtx) {
        trimmedCtx.clearRect(0, 0, cropW, cropH);
        trimmedCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        outputCanvas = trimmedCanvas;
      }
    }

    return await new Promise<Blob>((resolve, reject) => {
      outputCanvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Impossible de générer l’image.'));
          return;
        }
        resolve(blob);
      }, 'image/png');
    });
  };

  const handleSaveSignature = async () => {
    if (!agent?.ID) {
      error('Session invalide. Veuillez vous reconnecter.');
      return;
    }
    if (!signaturePreview && !sealPreview && !customText.trim()) {
      error('Veuillez ajouter au moins une image ou un texte.');
      return;
    }

    setSaving(true);
    try {
      const finalImage = await generateCompositeImage();
      const fileName = `${Date.now()}_${agent.ID}_signature.png`;
      const storagePath = `signatures/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('factures')
        .upload(storagePath, finalImage, {
          contentType: 'image/png',
          upsert: false
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { data: publicUrlData } = supabase.storage
        .from('factures')
        .getPublicUrl(storagePath);

      const signatureUrl = publicUrlData.publicUrl;

      const { error: updateError } = await supabase
        .from('AGENTS')
        .update({ signature: signatureUrl })
        .eq('ID', agent.ID);

      if (updateError) {
        throw new Error(updateError.message);
      }

      setSavedSignatureUrl(signatureUrl);
      success('Signature enregistrée avec succès.');
    } catch (err) {
      error(`Erreur d'enregistrement: ${err instanceof Error ? err.message : 'Erreur inconnue'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-800">{menuTitle}</h1>
        <p className="text-sm text-gray-600 mt-1">Configurez votre signature visuelle (signature + sceau + texte).</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <FileSignature size={16} />
            Editeur de signature
          </h2>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Texte personnalisable</label>
            <textarea
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="Ex: Validé et approuvé"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="border border-dashed border-gray-300 rounded-lg p-3 text-center cursor-pointer hover:bg-gray-50">
              <Upload size={16} className="mx-auto mb-1 text-gray-500" />
              <p className="text-xs font-medium text-gray-700">Uploader signature</p>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileSelection(e, 'signature')} />
              {signatureFile && <p className="text-[11px] text-gray-500 mt-1 truncate">{signatureFile.name}</p>}
            </label>

            <label className="border border-dashed border-gray-300 rounded-lg p-3 text-center cursor-pointer hover:bg-gray-50">
              <Upload size={16} className="mx-auto mb-1 text-gray-500" />
              <p className="text-xs font-medium text-gray-700">Uploader sceau</p>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileSelection(e, 'seal')} />
              {sealFile && <p className="text-[11px] text-gray-500 mt-1 truncate">{sealFile.name}</p>}
            </label>
          </div>

          <div className="space-y-3 pt-2 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-700">Taille des composants</p>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs text-gray-600">Texte</label>
                <span className="text-[11px] text-gray-500">{sizes.text}%</span>
              </div>
              <input
                type="range"
                min={50}
                max={220}
                value={sizes.text}
                onChange={(e) => applyScale('text', Number(e.target.value))}
                className="w-full"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs text-gray-600">Signature</label>
                <span className="text-[11px] text-gray-500">{sizes.signature}%</span>
              </div>
              <input
                type="range"
                min={50}
                max={220}
                value={sizes.signature}
                onChange={(e) => applyScale('signature', Number(e.target.value))}
                className="w-full"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs text-gray-600">Sceau</label>
                <span className="text-[11px] text-gray-500">{sizes.seal}%</span>
              </div>
              <input
                type="range"
                min={50}
                max={220}
                value={sizes.seal}
                onChange={(e) => applyScale('seal', Number(e.target.value))}
                className="w-full"
              />
            </div>
          </div>

          <button
            onClick={handleSaveSignature}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Enregistrement...' : 'Confirmer et enregistrer'}
          </button>
        </div>

        <div className="space-y-4">
          {previewCard}

          {savedSignatureUrl && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-2">Signature actuellement enregistrée</p>
              <img src={savedSignatureUrl} alt="Signature enregistrée" className="max-w-full w-auto h-auto max-h-72 object-contain rounded border border-gray-200" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProfileSignaturePage;
