
import React, { useState, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import Tesseract from 'tesseract.js';
import { UploadedScreen } from './types';
import { extractCopywritingFromText } from './services/geminiService';
import { generateExcelFile } from './services/excelService';

const App: React.FC = () => {
  const [screens, setScreens] = useState<UploadedScreen[]>([]);
  const [fileName, setFileName] = useState<string>('Copywriting_Project');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [hasStartedProcessing, setHasStartedProcessing] = useState<boolean>(false);
  const [isClearing, setIsClearing] = useState<boolean>(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');

  const stats = useMemo(() => {
    const total = screens.length;
    if (total === 0) return { success: 0, error: 0, total: 0, percent: 0, isFinished: false, hasErrors: false };
    
    const successCount = screens.filter(s => s.status === 'completed').length;
    const errorCount = screens.filter(s => s.status === 'error').length;
    const finishedCount = successCount + errorCount;
    
    // Defer error reporting in stats until global processing is done
    const uiErrorCount = isProcessing ? 0 : errorCount;
    const uiIsFinished = finishedCount === total && total > 0 && !isProcessing;
    const uiHasErrors = !isProcessing && errorCount > 0;
    
    return {
      success: successCount,
      error: uiErrorCount,
      total,
      percent: Math.round((finishedCount / total) * 100),
      successPercent: (successCount / total) * 100,
      errorPercent: (uiErrorCount / total) * 100,
      isFinished: uiIsFinished,
      hasErrors: uiHasErrors
    };
  }, [screens, isProcessing]);

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      const newScreensPromises = newFiles.map(async (file: File) => {
        const preview = URL.createObjectURL(file);
        
        const dimensions = await new Promise<{width: number, height: number}>((resolve) => {
            const img = new Image();
            img.onload = () => {
                resolve({ width: img.naturalWidth, height: img.naturalHeight });
            };
            img.src = preview;
        });

        return {
          id: uuidv4(),
          file,
          preview,
          status: 'pending' as const,
          width: dimensions.width,
          height: dimensions.height
        };
      });

      const processedScreens = await Promise.all(newScreensPromises);
      setScreens((prev) => [...prev, ...processedScreens]);
    }
  };

  const processImages = async () => {
    if (screens.length === 0 || isProcessing) return;
    setIsProcessing(true);
    setHasStartedProcessing(true);

    const updatedScreens = [...screens];

    for (let i = 0; i < updatedScreens.length; i++) {
      // Skip if already successfully completed
      if (updatedScreens[i].status === 'completed') continue;

      try {
        updatedScreens[i].status = 'processing';
        updatedScreens[i].errorStage = undefined;
        setScreens([...updatedScreens]);

        // Step 1: Read image
        setProcessingStatus(`Reading: ${updatedScreens[i].file.name}`);
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
        });
        reader.readAsDataURL(updatedScreens[i].file);
        const base64Result = await base64Promise;

        // Step 2: Extract Text locally using TesseractJS
        let rawOcrText = "";
        try {
            setProcessingStatus(`OCR Scanning: ${updatedScreens[i].file.name}`);
            const ocrResult = await Tesseract.recognize(base64Result, 'eng');
            rawOcrText = ocrResult.data.text;
            if (!rawOcrText || rawOcrText.trim().length === 0) {
                throw new Error("No text found");
            }
        } catch (ocrErr) {
            console.error("OCR Error:", ocrErr);
            updatedScreens[i].status = 'error';
            updatedScreens[i].errorStage = 'ocr';
            setScreens([...updatedScreens]);
            continue; 
        }

        // Step 3: Send extracted text to Gemini for structure and context
        try {
            setProcessingStatus(`AI Structuring: ${updatedScreens[i].file.name}`);
            const extraction = await extractCopywritingFromText(rawOcrText);
            updatedScreens[i].extractedData = extraction;
            updatedScreens[i].status = 'completed';
        } catch (aiErr) {
            console.error("AI Error:", aiErr);
            updatedScreens[i].status = 'error';
            updatedScreens[i].errorStage = 'ai';
            setScreens([...updatedScreens]);
            continue;
        }
        
      } catch (error) {
        console.error("General processing error:", error);
        updatedScreens[i].status = 'error';
      }
      setScreens([...updatedScreens]);
    }

    setIsProcessing(false);
    setProcessingStatus('');
  };

  const resetAll = () => {
    if (screens.length === 0) return;
    setIsClearing(true);
    const totalDuration = (screens.length * 80) + 400;

    setTimeout(() => {
      screens.forEach(s => {
        if (s.preview.startsWith('blob:')) {
          URL.revokeObjectURL(s.preview);
        }
      });
      setScreens([]);
      setIsProcessing(false);
      setHasStartedProcessing(false);
      setIsClearing(false);
      setProcessingStatus('');
    }, totalDuration);
  };

  const downloadExcel = () => {
    const completedScreens = screens.filter(s => s.status === 'completed');
    if (completedScreens.length === 0) {
      alert("No completed extractions to download.");
      return;
    }
    generateExcelFile(completedScreens, fileName);
  };

  const removeScreen = (id: string) => {
    setScreens(prev => {
        const screenToRemove = prev.find(s => id === s.id);
        if (screenToRemove?.preview.startsWith('blob:')) {
            URL.revokeObjectURL(screenToRemove.preview);
        }
        return prev.filter(s => id !== id);
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-12 text-gray-900">
      {/* Header */}
      <div className="mb-12 text-center">
        <h1 className="text-4xl font-extrabold text-gray-900 mb-2 flex items-center justify-center gap-4">
          <i className="ti ti-brand-figma text-[#1B60DC] text-5xl"></i>
          <span>Figma to Excell</span>
          <i className="ti ti-file-type-xls text-[#00B984] text-5xl"></i>
        </h1>
        <br/>
        <p className="text-gray-600 max-w-2xl mx-auto">
          Upload Figma screens to extract all copywriting into Excel with one click. 
          The exported Excel file preserves original image resolutions and original copywriting.
        </p>
      </div>
      {/* Sticky Header with Controls and Progress Bar */}
      <div className="sticky top-4 z-20 mb-8">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-4 overflow-x-auto relative z-10">
          <div className="flex flex-row justify-between items-center gap-6 whitespace-nowrap min-w-max">
            <div className="min-w-[240px] max-w-sm w-full">
              <div className="relative">
                <i className="fa-solid fa-file-signature absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
                <input 
                  type="text" 
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  placeholder="Project filename..."
                  className="pl-11 pr-4 w-full h-11 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-full focus:ring-[#144eb6] focus:border-[#144eb6] block outline-none transition-all"
                />
              </div>
            </div>
            
            <div className="flex flex-row gap-3 items-center">
              <label className="h-11 cursor-pointer bg-white hover:bg-gray-50 text-[#144eb6] font-bold px-6 border-2 border-[#144eb6] rounded-full shadow-sm flex items-center gap-2 transition-all">
                <i className="fa-solid fa-plus"></i>
                Add Screens
                <input type="file" multiple accept="image/*" onChange={onFileChange} className="hidden" />
              </label>

              <button 
                onClick={processImages}
                disabled={isProcessing || isClearing || screens.length === 0 || screens.every(s => s.status === 'completed')}
                className={`h-11 flex items-center justify-center gap-2 font-bold px-8 rounded-full shadow-sm transition-all ${
                  isProcessing || screens.length === 0 || isClearing ? 'bg-gray-300 cursor-not-allowed text-white' : 'bg-[#144eb6] hover:bg-[#0e3b8a] text-white'
                }`}
              >
                {isProcessing ? (
                  <>
                    <i className="fa-solid fa-spinner animate-spin"></i>
                    Processing...
                  </>
                ) : stats.hasErrors ? (
                  <>
                    <i className="fa-solid fa-rotate-right"></i>
                    Retry Failed
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-bolt"></i>
                    Extract All
                  </>
                )}
              </button>

              <button 
                onClick={downloadExcel}
                disabled={isClearing || !screens.some(s => s.status === 'completed')}
                className="h-11 bg-white hover:bg-gray-50 text-[#144eb6] disabled:text-gray-400 disabled:border-gray-200 font-bold px-6 border-2 border-[#144eb6] rounded-full shadow-sm flex items-center gap-2 transition-all"
              >
                <i className="fa-solid fa-download"></i>
                Download .XLSX
              </button>

              <button 
                onClick={resetAll}
                disabled={isClearing || screens.length === 0}
                className={`h-11 bg-white hover:bg-gray-50 text-[#144eb6] font-bold px-6 rounded-full flex items-center gap-2 transition-all border-none ${isClearing ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <i className={`fa-solid fa-rotate-right ${isClearing ? 'animate-spin' : ''}`}></i>
                Reset
              </button>
            </div>
          </div>
        </div>

        <div 
          className={`overflow-hidden transition-all duration-500 ease-in-out origin-top ${
            hasStartedProcessing 
              ? 'max-h-32 opacity-100 translate-y-2 pointer-events-auto mt-2' 
              : 'max-h-0 opacity-0 translate-y-0 pointer-events-none mt-0'
          }`}
        >
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-4">
              <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden flex">
                <div 
                  className="h-full transition-all duration-500 ease-out bg-[#00b855]"
                  style={{ width: `${stats.successPercent}%` }}
                />
                <div 
                  className="h-full transition-all duration-500 ease-out bg-red-500"
                  style={{ width: `${stats.errorPercent}%` }}
                />
              </div>
              <div className="flex flex-col items-end gap-1 min-w-[240px]">
                {stats.isFinished ? (
                  <div className="flex flex-col items-end">
                    <div className="flex items-center gap-2 text-gray-900 font-bold text-sm">
                      <span>{stats.hasErrors ? 'Action Required' : 'Processing Complete'}</span>
                      <i className={`fa-solid ${stats.hasErrors ? 'fa-circle-exclamation text-red-500' : 'fa-circle-info text-blue-500'}`}></i>
                    </div>
                    <div className="flex gap-2 text-[10px] uppercase font-bold mt-1">
                        <span className="text-[#00b855]">{stats.success} Succeeded</span>
                        {stats.error > 0 && (
                          <span className="text-red-500">
                            {stats.error}/{stats.total} is failed to extract please retry.
                          </span>
                        )}
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="text-gray-500 font-bold text-sm">
                      Progress: {stats.percent}%
                    </span>
                    {processingStatus && (
                        <span className="text-[10px] text-gray-400 font-medium italic animate-pulse">
                            {processingStatus}
                        </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid */}
      {screens.length === 0 && !isClearing ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-3xl border-2 border-dashed border-gray-200 animate-card-in">
          <i className="fa-solid fa-cloud-arrow-up text-6xl text-gray-300 mb-4"></i>
          <p className="text-xl font-medium text-gray-500">No screens uploaded yet</p>
          <p className="text-gray-400 mt-1">Start by clicking "Add Screens" above</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {screens.map((screen, index) => (
            <div 
              key={screen.id} 
              className={`bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden group flex flex-col ${isClearing ? 'animate-card-out' : 'animate-card-in opacity-0'}`}
              style={{ 
                animationDelay: `${index * 80}ms`,
                animationFillMode: 'forwards' 
              }}
            >
              <div className="relative aspect-video bg-gray-100">
                <img src={screen.preview} alt="Screen Preview" className="w-full h-full object-contain" />
                <button 
                  onClick={() => removeScreen(screen.id)}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-red-500/80 hover:bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
                {/* Mask error state as processing while global isProcessing is true */}
                {(screen.status === 'processing' || (screen.status === 'error' && isProcessing)) && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-sm z-10">
                    <div className="text-white flex flex-col items-center gap-2 text-center px-4">
                      <i className="fa-solid fa-spinner animate-spin text-3xl"></i>
                      <span className="font-bold text-sm uppercase tracking-wider">Processing Screen</span>
                      <span className="text-[10px] opacity-80 italic">OCR and AI structuring in progress...</span>
                    </div>
                  </div>
                )}
                <div className="absolute bottom-2 left-2 flex gap-1 z-10">
                   {screen.status === 'completed' && (
                    <div className="bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-md">
                      <i className="fa-solid fa-circle-check"></i> Ready
                    </div>
                  )}
                  {/* Badge only shows error after global processing is done */}
                  {screen.status === 'error' && !isProcessing && (
                    <div className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-md">
                      <i className="fa-solid fa-circle-exclamation"></i> 
                      {screen.errorStage === 'ocr' ? 'OCR Failed' : 'AI Failed'}
                    </div>
                  )}
                  <div className="bg-gray-800/70 text-white text-[10px] px-2 py-0.5 rounded-full shadow-md">
                    {screen.width}x{screen.height}
                  </div>
                </div>
              </div>
              
              <div className="p-4 flex-1 flex flex-col min-h-[180px]">
                <h3 className="text-xs font-semibold text-gray-400 mb-2 truncate">{screen.file.name}</h3>
                
                {screen.status === 'completed' ? (
                  <div className="space-y-2 flex-1 animate-card-in">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-[#144eb6] tracking-wider">AI-Structured Copy (Remark)</span>
                      <div className="mt-1 p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs text-gray-700 max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                        {screen.extractedData?.remark}
                      </div>
                    </div>
                  </div>
                ) : (screen.status === 'error' && !isProcessing) ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center py-4 animate-card-in">
                    <i className="fa-solid fa-triangle-exclamation text-2xl mb-2 text-red-500"></i>
                    <p className="text-xs font-bold uppercase tracking-widest text-red-500">
                      {screen.errorStage === 'ocr' ? 'OCR Extraction Error' : 'AI Structuring Error'}
                    </p>
                    <p className="text-[10px] text-red-400 mt-1 px-4">
                      {screen.errorStage === 'ocr' 
                        ? 'Failed to extract text locally. Please check image quality.' 
                        : 'Failed to structure text with Gemini. Please check connection.'}
                    </p>
                    <p className="text-[10px] text-gray-400 italic">Use the 'Retry Failed' button at the top to attempt again.</p>
                  </div>
                ) : (screen.status === 'processing' || (screen.status === 'error' && isProcessing)) ? (
                   <div className="flex-1 flex flex-col items-center justify-center text-center py-4">
                      <i className="fa-solid fa-spinner animate-spin text-2xl text-blue-500 mb-2"></i>
                      <p className="text-xs text-gray-500 font-medium">Extracting data...</p>
                   </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-gray-400 italic text-sm py-12">
                    Waiting to process...
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer Info */}
      <div className="mt-16 text-center text-gray-400 text-sm">
        <p>OCR powered by Tesseract.js | Structure by Gemini AI</p>
        <p className="mt-1 text-xs">Images are OCR'd locally. Only text is sent to the AI to reduce token usage and improve privacy.</p>
      </div>
    </div>
  );
};

export default App;
