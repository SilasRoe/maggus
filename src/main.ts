/**
 * Main application file for the PDF data management tool.
 * This file handles PDF file selection, folder browsing, and data table management.
 *
 * Key Features:
 * - PDF file selection via file dialog
 * - Folder browsing with PDF filtering
 * - Interactive data table with Handsontable
 * - PDF file opening functionality
 *
 * Dependencies:
 * - @tauri-apps/plugin-dialog for file/folder selection
 * - @tauri-apps/plugin-fs for filesystem operations
 * - @tauri-apps/api/path for path manipulation
 * - @tauri-apps/plugin-opener for opening files
 * - Handsontable for data grid functionality
 */

import { open } from '@tauri-apps/plugin-dialog'
import { readDir } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'
import Handsontable from 'handsontable'
import { openPath } from '@tauri-apps/plugin-opener';

import 'handsontable/styles/handsontable.min.css';
import 'handsontable/styles/ht-theme-main.min.css';

/**
 * Interface representing a row of PDF data in the table
 */
interface PdfDataRow {
  pdfName: string
  fullPath: string
  rechnungsNr: string | null
  datum: string | null
  betrag: number | null
}

/**
 * Array storing paths of selected PDF files
 */
let selectedPdfPaths: string[] = []

/**
 * Initialize event listeners when DOM content is loaded
 */
document.addEventListener('DOMContentLoaded', () => {
  const selectFilesBtn = document.querySelector('#select-files-btn')
  const selectFolderBtn = document.querySelector('#select-folder-btn')

  if (selectFilesBtn) {
    selectFilesBtn.addEventListener('click', handleSelectFiles)
  }
  if (selectFolderBtn) {
    selectFolderBtn.addEventListener('click', handleSelectFolder)
  }
})

/**
 * Handle PDF file selection via file dialog
 */
async function handleSelectFiles() {
  const result = await open({
    title: 'PDF-Dateien auswählen',
    multiple: true,
    filters: [{
      name: 'PDF',
      extensions: ['pdf']
    }]
  })

  if (Array.isArray(result)) {
    selectedPdfPaths = result
  } else if (result) {
    selectedPdfPaths = [result]
  } else {
    selectedPdfPaths = []
  }

  updateFileUI()
}

/**
 * Handle folder selection and filter PDF files
 */
async function handleSelectFolder() {
  const result = await open({
    title: 'PDF-Ordner auswählen',
    directory: true,
    multiple: false
  })

  if (typeof result === 'string') {
    try {
      const entries = await readDir(result)

      const pdfEntries = entries.filter(
        entry => entry.name?.toLowerCase().endsWith('.pdf') && !entry.isDirectory
      )

      selectedPdfPaths = await Promise.all(
        pdfEntries.map(entry => join(result, entry.name!))
      )

    } catch (e) {
      console.error("Fehler beim Lesen des Ordners:", e)
      selectedPdfPaths = []
    }

  } else {
    selectedPdfPaths = []
  }

  updateFileUI()
}

/**
 * Update the file UI with selected PDF data
 */
function updateFileUI() {
  if (!hot) return

  const tableData = selectedPdfPaths.map(path => {
    const lastSeparatorIndex = Math.max(
      path.lastIndexOf('/'),
      path.lastIndexOf('\\')
    )
    const fileName = path.substring(lastSeparatorIndex + 1)

    return {
      pdfName: fileName,
      fullPath: path,
      rechnungsNr: null,
      datum: null,
      betrag: null
    }
  })

  hot.loadData(tableData)
}

/**
 * Initialize navigation button event listeners
 */
document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('.sliding-nav') as HTMLElement
  const buttons = Array.from(
    nav.querySelectorAll('button')
  ) as HTMLElement[]

  if (!nav) return

  function updateUnderlinePosition() {
    const activeButton = nav.querySelector('button.active') as HTMLElement
    if (!activeButton) return

    const left = activeButton.offsetLeft
    const width = activeButton.offsetWidth

    nav.style.setProperty('--underline-left', `${left}px`)
    nav.style.setProperty('--underline-width', `${width}px`)
  }

  buttons.forEach(button => {
    button.addEventListener('click', () => {
      buttons.forEach(btn => btn.classList.remove('active'))
      button.classList.add('active')
      updateUnderlinePosition()
    })
  })

  updateUnderlinePosition()
})

/**
 * Custom renderer for ellipsis in table cells
 */
function ellipsisRenderer(
  this: Handsontable.Core,
  _instance: Handsontable.Core,
  td: HTMLTableCellElement,
  _row: number,
  _col: number,
  _prop: string | number,
  value: Handsontable.CellValue,
  _cellProperties: Handsontable.CellProperties
) {
  Handsontable.renderers.TextRenderer.apply(this, arguments as any)

  if (value !== null && value !== undefined) {
    td.title = String(value)
  }
}

/**
 * Handsontable instance for data grid
 */
let hot: Handsontable | null = null

/**
 * Initialize Handsontable data grid
 */
document.addEventListener('DOMContentLoaded', () => {
  const container = document.querySelector('#data-grid')
  if (!container) return

  hot = new Handsontable(container, {
    data: [],
    colHeaders: ['PDF-Datei'],
    className: 'htEllipsis',
    renderer: ellipsisRenderer,
    columns: [
      { data: 'pdfName', readOnly: true, className: 'htEllipsis htLink' },
      { data: 'rechnungsNr' },
      { data: 'datum', type: 'date', dateFormat: 'YYYY-MM-DD' },
      { data: 'betrag', type: 'numeric', numericFormat: { pattern: '0.00 €' } },
      {},
      {},
      {},
      {},
      {}
    ],

    async afterOnCellMouseDown(_event, coords) {
      if (coords.col === 0 && hot) {
        const rowData = hot.getSourceDataAtRow(coords.row) as PdfDataRow
        if (rowData && rowData.fullPath) {
          await openPath(rowData.fullPath)
        }
      }
    },

    minSpareRows: 0,
    rowHeaders: false,
    stretchH: 'all',
    autoColumnSize: false,
    themeName: 'ht-theme-main-dark-auto',
    licenseKey: 'non-commercial-and-evaluation'
  })
})