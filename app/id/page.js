'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import MemberIdCard from '@/components/MemberIdCard'

export default function MemberIdBuilder() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
  })

  const [generatedId, setGeneratedId] = useState(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [photo, setPhoto] = useState(null)
  const [showCamera, setShowCamera] = useState(false)
  const [cameraStream, setCameraStream] = useState(null)

  const fileInputRef = useRef(null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        // 5MB limit
        alert('El archivo es demasiado grande. El tamano maximo es 5MB.')
        return
      }

      const reader = new FileReader()
      reader.onload = (e) => {
        setPhoto(e.target.result)
      }
      reader.readAsDataURL(file)
    }
  }

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      })
      setCameraStream(stream)
      setShowCamera(true)
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    } catch (err) {
      alert('No se pudo acceder a la camara. Asegurese de dar permisos.')
      console.error('Error accessing camera:', err)
    }
  }

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop())
      setCameraStream(null)
    }
    setShowCamera(false)
  }

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current
      const canvas = canvasRef.current
      const context = canvas.getContext('2d')

      // Set canvas size to match video
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      // Draw video frame to canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height)

      // Convert to data URL
      const photoData = canvas.toDataURL('image/jpeg', 0.8)
      setPhoto(photoData)

      // Stop camera
      stopCamera()
    }
  }

  const generateMemberId = async () => {
    setIsGenerating(true)

    // Simulate processing time
    await new Promise((resolve) => setTimeout(resolve, 1000))

    const randomId = Math.random().toString(36).substr(2, 6).toUpperCase()
    const memberNumber = Math.floor(Math.random() * 9999) + 1
    const memberId = `SAC-${memberNumber.toString().padStart(4, '0')}-${randomId}`

    setGeneratedId({
      id: memberId,
      timestamp: new Date().toLocaleString('es-PR'),
      data: { ...formData },
      photo: photo,
    })

    setIsGenerating(false)
  }

  const downloadId = () => {
    if (!generatedId) return

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    canvas.width = 900
    canvas.height = 600

    // Clean white background
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, 900, 600)

    // Header
    ctx.fillStyle = '#2563EB' // blue-600
    ctx.font = 'bold 24px Inter'
    ctx.textAlign = 'center'
    ctx.fillText('SOCIEDAD DE ASTRONOMIA DEL CARIBE', 450, 80)

    // Member ID
    ctx.fillStyle = '#111827' // gray-900
    ctx.font = 'bold 48px Inter'
    ctx.fillText(generatedId.id, 450, 140)

    // Decorative line
    ctx.strokeStyle = '#2563EB' // blue-600
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(300, 160)
    ctx.lineTo(600, 160)
    ctx.stroke()

    // Photo (if available)
    if (generatedId.photo) {
      const img = new window.Image()
      img.onload = () => {
        // Draw photo in top right corner
        const photoSize = 120
        const photoX = canvas.width - photoSize - 50
        const photoY = 50

        // Draw photo with rounded corners effect
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(photoX, photoY, photoSize, photoSize, 10)
        ctx.clip()
        ctx.drawImage(img, photoX, photoY, photoSize, photoSize)
        ctx.restore()

        // Draw border around photo
        ctx.strokeStyle = '#2563EB'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.roundRect(photoX, photoY, photoSize, photoSize, 10)
        ctx.stroke()
      }
      img.src = generatedId.photo
    }

    // Member info section
    const infoY = 220
    const lineHeight = 50

    ctx.fillStyle = '#374151' // gray-700
    ctx.font = 'bold 20px Inter'
    ctx.textAlign = 'left'

    // Name
    ctx.fillText('Nombre:', 100, infoY)
    ctx.fillStyle = '#111827' // gray-900
    ctx.fillText(`${generatedId.data.firstName} ${generatedId.data.lastName}`, 280, infoY)

    // Date
    ctx.fillStyle = '#374151' // gray-700
    ctx.fillText('Generado:', 100, infoY + lineHeight)
    ctx.fillStyle = '#6B7280' // gray-500
    ctx.font = '16px Inter'
    ctx.fillText(generatedId.timestamp, 280, infoY + lineHeight)

    // Footer
    ctx.fillStyle = '#6B7280' // gray-500
    ctx.font = 'bold 18px Inter'
    ctx.textAlign = 'center'
    ctx.fillText('ID Valido para eventos SAC', 450, 520)

    ctx.fillStyle = '#2563EB' // blue-600
    ctx.font = '16px Inter'
    ctx.fillText('Miembro Activo', 450, 550)

    // Border
    ctx.strokeStyle = '#E5E7EB' // gray-200
    ctx.lineWidth = 2
    ctx.strokeRect(10, 10, 880, 580)

    // Download
    const link = document.createElement('a')
    link.download = `SAC-MemberID-${generatedId.id}.png`
    link.href = canvas.toDataURL()
    link.click()
  }

  const resetForm = () => {
    setFormData({
      firstName: '',
      lastName: '',
    })
    setGeneratedId(null)
    setPhoto(null)
    if (cameraStream) {
      stopCamera()
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
            SAC ID
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Disena tu identificacion oficial del miembro
          </p>
        </div>

        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Form Section */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 border border-gray-200 dark:border-gray-700">
              <div className="space-y-6">
                {/* Personal Information */}
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="firstName"
                        className="block text-gray-700 dark:text-gray-300 font-medium mb-2"
                      >
                        Nombre
                      </label>
                      <input
                        type="text"
                        name="firstName"
                        id="firstName"
                        value={formData.firstName}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                        placeholder=""
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="lastName"
                        className="block text-gray-700 dark:text-gray-300 font-medium mb-2"
                      >
                        Apellidos
                      </label>
                      <input
                        type="text"
                        name="lastName"
                        id="lastName"
                        value={formData.lastName}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                        placeholder=""
                      />
                    </div>
                  </div>
                </div>

                {/* Photography Guidelines */}
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Guia para la Foto
                  </h4>
                  <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
                    <div className="flex items-start space-x-3">
                      <span className="w-2 h-2 bg-blue-600 rounded-full mt-2 shrink-0"></span>
                      <span>Use buena iluminacion</span>
                    </div>
                    <div className="flex items-start space-x-3">
                      <span className="w-2 h-2 bg-blue-600 rounded-full mt-2 shrink-0"></span>
                      <span>Mantenga la camara estable y alineada</span>
                    </div>
                    <div className="flex items-start space-x-3">
                      <span className="w-2 h-2 bg-blue-600 rounded-full mt-2 shrink-0"></span>
                      <span>Evite sombras y reflejos</span>
                    </div>
                    <div className="flex items-start space-x-3">
                      <span className="w-2 h-2 bg-blue-600 rounded-full mt-2 shrink-0"></span>
                      <span>Use un fondo solido y sin distracciones</span>
                    </div>
                  </div>
                </div>

                {/* Photo Upload Section (moved below instructions) */}
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <button
                        type="button"
                        onClick={startCamera}
                        className="flex-1 bg-blue-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-500 transition-all duration-300 shadow-md"
                      >
                        Tomar Foto
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex-1 bg-gray-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-gray-700 dark:hover:bg-gray-500 transition-all duration-300 shadow-md"
                      >
                        Subir Foto
                      </button>
                    </div>
                    {/* Hidden file input */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    {/* Photo preview */}
                    {photo && (
                      <div className="mt-4">
                        <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Foto seleccionada:
                        </h5>
                        <div className="relative inline-block">
                          <Image
                            src={photo}
                            alt="Preview"
                            width={128}
                            height={128}
                            className="w-32 h-32 object-cover rounded-lg border-2 border-gray-300"
                          />
                          <button
                            onClick={() => setPhoto(null)}
                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-red-600"
                          >
                            x
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-4">
                  <button
                    onClick={generateMemberId}
                    disabled={isGenerating || !formData.firstName || !formData.lastName}
                    className="flex-1 bg-blue-600 text-white font-semibold py-4 px-6 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-500 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                  >
                    {isGenerating ? (
                      <span className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                        Generando identificacion...
                      </span>
                    ) : (
                      'Submit'
                    )}
                  </button>

                  <button
                    onClick={resetForm}
                    className="px-6 py-4 bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-all duration-300"
                  >
                    Reiniciar
                  </button>
                </div>

                {/* Download button - shown after ID is generated */}
                {generatedId && (
                  <button
                    onClick={downloadId}
                    className="w-full bg-green-600 text-white font-semibold py-4 px-6 rounded-lg hover:bg-green-700 transition-all duration-300 shadow-md"
                  >
                    Descargar ID
                  </button>
                )}
              </div>
            </div>

            {/* Preview Section */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 border border-gray-200 dark:border-gray-700 min-h-[340px] flex flex-col">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                Vista Previa
              </h3>
              {formData.firstName || formData.lastName || photo ? (
                <MemberIdCard memberData={generatedId} formData={formData} photo={photo} />
              ) : (
                <div className="flex flex-1 items-start justify-center text-gray-500 dark:text-gray-400 mt-8">
                  <div className="text-center">
                    <div className="text-4xl mb-4 text-gray-300 dark:text-gray-600">
                      <svg
                        className="w-16 h-16 mx-auto"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2"
                        />
                      </svg>
                    </div>
                    <p className="text-lg">Complete el formulario para generar su identificacion</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Camera Modal */}
      {showCamera && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4 text-center">
              Tomar Foto
            </h3>

            <div className="relative mb-4">
              <video ref={videoRef} autoPlay playsInline className="w-full rounded-lg">
                <track kind="captions" />
              </video>
              <canvas ref={canvasRef} className="hidden" />
            </div>

            <div className="flex gap-4">
              <button
                onClick={takePhoto}
                className="flex-1 bg-blue-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-blue-700 transition-all duration-300"
              >
                Capturar
              </button>
              <button
                onClick={stopCamera}
                className="flex-1 bg-gray-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-gray-700 transition-all duration-300"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
