(() => {
  const DOCK_ID = 'kk-dock'
  const WRAPPER_CLASS = DOCK_ID + '-addon-wrapper'
  let userId = ''

  if (globalThis.dockIsReady) return

  let waitUntilReady = setInterval(waitUntilReadyCallback, 100)

  function waitUntilReadyCallback() {
    userId = document.querySelector('#loggedInUserDropdown .nge-usercard-email')
    if (!userId) return

    clearInterval(waitUntilReady)
    // dockIsReady could be set in the meantime by another instance of the script
    if (globalThis.dockIsReady) return
    userId = userId.textContent
    globalThis.dockIsReady = true
    main()
  }
  

  function main() {
    const dockElement = prepare()

    // proxy for fetch
    let f = globalThis.fetch
    globalThis.fetch = async (...args) => {
      let res = f(...args)

      res
        .then(response => response.clone())
        .then(response => response.json())
        .then(response => {
          document.dispatchEvent(new CustomEvent('fetch', {
            detail: {
              url: args[0],
              params: args[1],
              response: response
            }
          }))
      })

      return res
    }


    function toggleAddonsWrapper() {
      // source why window.getComputedStyle(): https://stackoverflow.com/a/2298849
      let isClosed = window.getComputedStyle(Dock.element).display === 'none'
      Dock.element.style.display = isClosed ? 'flex' : 'none'
      localStorage.setItem(`${userId}-${DOCK_ID}-is-closed`, isClosed)
    }


    globalThis.Dock = class {
      static #instance = null
      static element = dockElement
      static userId = userId

      static ls = {
        keyPrefix: `${userId}-${DOCK_ID}-`,
        get(key, JSONparse = false) {
          let value = localStorage.getItem(Dock.ls.keyPrefix + key)
          return JSONparse && value ? JSON.parse(value) : value
        },

        set(key, value, JSONstringify = false) {
          value = JSONstringify && value ? JSON.stringify(value) : value
          localStorage.setItem(Dock.ls.keyPrefix + key, value)
        },

        remove(key) {
          localStorage.removeItem(Dock.ls.keyPrefix + key)
        }
      }

      
      #gridSize = 15
      #moving = false
      #editable = false
      #grabbedAddon = null
      #movingDifference = {}
      #grid = false
      #resizeDialog = null


      constructor() {
        if (Dock.instance) return Dock.instance

        Dock.instance = this

        this.#addStyles()
        this.#createGrid()
        this.#createAuxButtons()

        Dock.element.addEventListener('mousedown', (e) => this.#editableMouseDownHandler(e))
        Dock.element.addEventListener('mousemove', (e) => this.#editableMouseMoveHandler(e))
        Dock.element.addEventListener('mouseup'  , (e) => this.#editableMouseUpHandler(e))
        if (Dock.ls.get('is-closed') !== 'false') {
          toggleAddonsWrapper()
        }

        this.#positionDock()
        this.#resizeDialog = this.#createResizeDialog()
      }


      #createAuxButtons() {
        this.#createAuxButton({
          id: 'organize-button',
          name: 'O',
          tooltip: 'Organize addons',
          handler: () => this.#organizeButtonHandler()
        })

        this.#createAuxButton({
          id: 'resize-button',
          name: 'R',
          tooltip: 'Resize Dock',
          handler: () => this.#resizeButtonHandler()
        })
        
        let moveButton = this.#createAuxButton({
          id: 'move-button',
          name: 'M',
          tooltip: 'Move Dock'
        })

        moveButton.addEventListener('mousedown', e => this.#moveButtonMouseDownHandler(e))
        document.addEventListener('mousemove', e => this.#moveButtonHandler(e))
        document.addEventListener('mouseup', e => this.#moveButtonMouseUpHandler(e))
        window.addEventListener('resize', e => this.#resizeWindowHandler(e))
      }


      #positionDock() {
        let dockPosition = Dock.ls.get('position', true)
        let dockElementStyle = Dock.element.style
        if (!dockPosition) {
          let dockStyles = window.getComputedStyle(Dock.element)
          dockElementStyle.top = 0
          let windowWidth = window.innerWidth
          let dockWidth = windowWidth - parseInt(dockStyles.width, 10)
          dockElementStyle.left = window.innerWidth / 2 - parseInt(dockStyles.width, 10) / 2 + 'px'
        }
        else {
          this.#repositionDock(dockPosition.left, dockPosition.top)
        }
      }


      #repositionDock(x, y) {
        let style = Dock.element.style
        let dockWidth = parseInt(style.width, 10)
        let dockHeight = parseInt(style.height, 10)
        if (x < 0) x = 0
        if (y < 0) y = 0
        if (x + dockWidth > window.innerWidth) x = window.innerWidth - dockWidth
        if (y + dockHeight > window.innerHeight) y = window.innerHeight - dockHeight
        Dock.element.style.left = x + 'px'
        Dock.element.style.top = y + 'px'
      }


      #resizeWindowHandler() {
        let style = Dock.element.style
        let x = parseInt(style.left, 10)
        let y = parseInt(style.top, 10)
        this.#repositionDock(x, y)
      }


      #moveButtonMouseDownHandler(e) {
        if (!e.buttons === 1) return

        let style = window.getComputedStyle(Dock.element)

        this.#moving = true
        this.#movingDifference = {
          x: e.clientX - parseInt(style.left, 10),
          y: e.clientY - parseInt(style.top, 10)
        }
      }

      
      #moveButtonMouseUpHandler(e) {
        if (this.#moving) {
          this.#moving = false
          Dock.ls.set('position', {
            top: parseInt(Dock.element.style.top, 10),
            left: parseInt(Dock.element.style.left, 10)
          }, true)
        }
      }


      #editableMouseDownHandler(e) {
        if (!this.#editable) return
        if (!e.target.classList.contains('legend') && !e.target.parentElement.classList.contains('legend')) return

        let addon = e.target
        while (!addon.classList.contains(WRAPPER_CLASS) || !addon.tagName === 'BODY') {
          addon = addon.parentElement
        }

        this.#grabbedAddon = addon

        // Source: https://esstudio.site/2018/11/01/create-draggable-elements-with-javascript.html
        this.X = e.clientX - this.#grabbedAddon.style.left.slice(0, -2);
        this.Y = e.clientY - this.#grabbedAddon.style.top.slice(0, -2);
      }


      #editableMouseUpHandler(e) {
        if (!this.#editable) return
        if (!this.#grabbedAddon) return

        let x = this.#grabbedAddon.offsetLeft
        let y = this.#grabbedAddon.offsetTop
        Dock.ls.set('addon-position-' + this.#grabbedAddon.id, `{"x": ${x}, "y": ${y}}`)
        this.#grabbedAddon = null
      }


      #editableMouseMoveHandler(e) {
        if (!this.#editable) return
        if (!this.#grabbedAddon) return

        // Source: https://esstudio.site/2018/11/01/create-draggable-elements-with-javascript.html
        this.#grabbedAddon.style.left = Math.floor((e.clientX - this.X) / this.#gridSize) * this.#gridSize + 'px';
        this.#grabbedAddon.style.top = Math.floor((e.clientY - this.Y) / this.#gridSize) * this.#gridSize + 'px';
      }


      #createAuxButton({ id, name, handler, tooltip = '' }) {
        let button = document.createElement('button')
        button.id = DOCK_ID + '-' + id
        button.textContent = name
        button.title = tooltip
        button.classList.add(DOCK_ID + '-aux-button')
        if (handler) {
          button.addEventListener('click', handler)
        }
        Dock.element.appendChild(button)

        return button
      }


      #organizeButtonHandler() {
        this.#toggleGrid()
        this.#editable = !this.#editable
      }


      #moveButtonHandler(e) {
        if (!this.#moving) return

        let left = e.clientX - this.#movingDifference.x
        let top = e.clientY - this.#movingDifference.y
        this.#repositionDock(left, top)
      }


      #resizeButtonHandler() {
        this.#resizeDialog.show()
      }


      #addStyles() {
        let style = document.createElement('style')
        style.type = 'text/css'
        style.textContent = /*css*/`
          :root {
            --kk-dock-addon-button-color: #5454d3;
            --kk-dock-addon-button-color-active: yellow;
            --kk-dock-addon-font-family: arial, sans-serif;
          }

          #${DOCK_ID} {
            display: none;
            background-color: rgba(30, 30, 30, 0.8);
            position: absolute;
            top: 0;
            left: 0;
            z-index: 31;
            align-items: flex-start;
            flex-wrap: wrap;
            top: 0;
            border-radius: 10px;
            font-family: var(--kk-dock-addon-font-family);
            font-size: 13px;
          }

          .${DOCK_ID}-aux-button {
            position: absolute;
            right: 0;
            height: 15px;
            width: 15px;
            background-color: #5454d3;
            padding: 0;
            margin: 0;
            font-size: 9px;
            border-radius: 2px;
            cursor: pointer;
            color: white;
            border: 1px solid rgba(30, 30, 30, 0.8);
          }

          #${DOCK_ID}-organize-button {
            top: 0px;
          }

          #${DOCK_ID}-resize-button {
            top: 15px;
          }

          #${DOCK_ID}-move-button {
            top: 30px;
          }

          #${DOCK_ID} label {
            font-family: var(--kk-dock-addon-font-family);
            display: inline-block;
            margin: 3px;
          }

          #{DOCK_ID} input[type="checkbox"] {
            vertical-align: bottom;
          }

          .${WRAPPER_CLASS} {
            border: 1px solid #404040;
            border-radius: 4px;
            padding: 7px 2px 2px 2px;
            margin: 3px;
            margin-top: 10px;
            position: absolute;
          }

          .${WRAPPER_CLASS} .legend {
            position: absolute;
            top: -7px;
            font-size: 11px;
            color: #c3c3c3;
            font-family: sans-serif;
            left: 0;
            right: 0;
            text-align: center;
            cursor: default;
          }

          .${WRAPPER_CLASS} .legend > span {
            background-color: rgba(30, 30, 30, 0.95);
          }

          .${WRAPPER_CLASS} button {
            color: white;
            background-color: transparent;
            border: 1px solid var(--kk-dock-addon-button-color);
            border-radius: 4px;
            margin: 2px;
            padding: 4px 8px;
            cursor: pointer;
          }

          .${WRAPPER_CLASS} button:hover {
            box-shadow: 0 0 0.3em var(--kk-dock-addon-button-color);
          }

          .${WRAPPER_CLASS} button.active {
            border: 1px solid var(--kk-dock-addon-button-color-active);
          }

          .${WRAPPER_CLASS} button.active:hover {
            box-shadow: 0 0 0.3em var(--kk-dock-addon-button-color-active);
          }

          .${WRAPPER_CLASS} button:disabled {
            color: gray;
            border-color: gray;
            box-shadow: none;
          }

          #${DOCK_ID}-grid {
            display: none;
            z-index: -1;
          }

          .hline{
            height: 1px;
            position: absolute;
            background-color: #444;
          }
          
          .vline{
            width: 1px;
            position: absolute;
            background-color: #444;
          }
        `
        document.head.appendChild(style)
      }


      addAddon({ id, name, html, css, events, options }) {
        this.#addAddonCss(css)
        this.#addAddonHtml(id, name, html, options)
        this.#addAddonEvents(events)
      }

      
      #addAddonCss(css) {
        if (!css) return

        css = `<style>${css}</style>`
        document.head.insertAdjacentHTML('beforeend', css)
      }


      #addAddonEvents(events) {
        if (!events) return

        for (const [selector, value] of Object.entries(events)) {
          for (const [eventName, listener] of Object.entries(value)) {
            let listenerIsObject = typeof listener === 'object'
            let singleNode = listener.singleNode

            let target = document.querySelectorAll(selector)
            let handler = listenerIsObject ? listener.handler : listener
            let params = [eventName, e => handler(e)]

            if (!target && !listener) continue

            if (listenerIsObject && singleNode) {
              target[0].addEventListener(...params)
            }
            else {
              target.forEach(el => el.addEventListener(...params))
            }
          }
        }
      }


      #addAddonHtml(id, name, html, options) {
        if (!html) return
        if (typeof html === 'function') return html()

        if (typeof html === 'object') {
          let target = document.querySelector(html.insert.target)
          if (!target) return console.error('Dock: HTML target doesn\'t exist')

          target.insertAdjacentHTML(html.insert.position, html.text)

          return
        }

        if (options && options.htmlOutsideDock) {
          document.body.insertAdjacentHTML('beforeend', html)
        }
        else {
          if (!name) return console.error('Dock: Missing name')
          if (!id) return console.error('Dock: missing ID')

          html = /*html*/`
            <div id="${id}" class="${WRAPPER_CLASS}">
              <div class="legend">
                <span>&nbsp;${name}&nbsp;</span>
              </div>
              ${html}
            </div>
          `

          Dock.element.insertAdjacentHTML('beforeend', html)

          let position = Dock.ls.get('addon-position-' + id, true)
          if (position) {
            document.getElementById(id).style.left = position.x + 'px'
            document.getElementById(id).style.top = position.y + 'px'
          }
        }
      }


      #createGrid() {
        let frag = document.createDocumentFragment()
        let wrapper = document.createElement('div')
        wrapper.id = DOCK_ID + '-grid'
        frag = frag.appendChild(wrapper)
        let wasHidden = false

        if (window.getComputedStyle(Dock.element).display === 'none') {
          Dock.element.style.display = 'flex'
          wasHidden = true
        }

        let width = Dock.element.offsetWidth
        let height = Dock.element.offsetHeight

        if (wasHidden) {
          Dock.element.style.display = 'none'
        }

        for (let i = 0; i <= width; i += this.#gridSize) {
          let div = document.createElement('div')
          div.classList.add('vline')
          div.style.left = i + 'px'
          div.style.height = height + 'px'
          frag.appendChild(div)
        }

        for (let i = 0; i <= height; i += this.#gridSize) {
          let div = document.createElement('div')
          div.classList.add('hline')
          div.style.top = i + 'px'
          div.style.width = width + 'px'
          frag.appendChild(div)
        }

        this.#grid = Dock.element.appendChild(frag)
      }


      #resetGrid() {
        this.#toggleGrid()
        this.#grid.remove()
        this.#createGrid()
        this.#toggleGrid()
      }


      #toggleGrid() {
        this.#grid.style.display = window.getComputedStyle(this.#grid).display === 'none' ? 'block' : 'none'        
      }

      // helper methods
      static getSegmentId(x, y, z, callback) {
        GM_xmlhttpRequest({
          method: 'POST',
          url: 'https://services.itanna.io/app/transform-service/query/dataset/flywire_190410/s/2/values_array_string_response',
          data: `{"x":[${x}],"y":[${y}],"z":[${z}]}`,
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          onload: response => response && callback(JSON.parse(response.response).values[0][0])
        })
      }


      static getRootId(supervoxelId, callback) {
        let authToken = localStorage.getItem('auth_token')
      
        fetch(`https://prodv1.flywire-daf.com/segmentation/api/v1/table/fly_v31/node/${supervoxelId}/root?int64_as_str=1&middle_auth_token=${authToken}`)
          .then(response => response.json())
          .then(response => {
            if (!response) return
            callback(response.root_id)
          })
      }


      static stringToUint64(s) {
        function Result(low, high) {
          this.low = low
          this.high = high
        }
        Result.prototype.toString = () => s

        if (!s) return new Result(0, 0)

        const MAX_INT_LENGTH = 9
        const MAX_HEX_INT_LENGTH = 8
      
        if (s.length <= MAX_INT_LENGTH) return { low: +s, high: 0 }
      
        let bs = BigInt(s).toString(16)
        if (bs.length % 2) {
          bs = '0' + bs
        }
      
        let low = bs.substring(MAX_HEX_INT_LENGTH)
        let high = bs.substring(0, bs.length - low.length)
      
        low = parseInt(low, 16)
        high = high ? parseInt(high, 16) : 0

        return new Result(low, high)
      }


      static rgbToUint64(color) {
        let colorObj = color.substring(1)
        let r = parseInt(colorObj.substring(0, 2), 16)
        let g = parseInt(colorObj.substring(2, 4), 16)
        let b = parseInt(colorObj.substring(4, 6), 16)
        // color will always be below FFFFFFFF, so there's no need to convert it to Uint64
        return { low: r * 256 * 256 + g * 256 + b, high: 0 }
      }


      static getCurrentCoords() {
        let coords = document
          .querySelector('.neuroglancer-position-widget-input')
          .value
          .split(',')
          .map(el => el.trim())

        return coords
      }

      
      static jumpToCoords(coords) {
        let voxelSize = Dock.getVoxelSize()
        coords = Dock.multiplyVec3(coords, voxelSize)
        viewer.layerSpecification.setSpatialCoordinates(coords)
      }


      static getCurrentMouseCoords() {
        let coords = document
          .querySelector('.neuroglancer-mouse-position-widget')
          .textContent
          .split(',')
          .map(el => el.trim().split(' ')[1])

        return coords
      }


      static getHighlightedSupervoxelId() {
        let id = document
          .querySelector('div[data-type="segmentation_with_graph"] .neuroglancer-layer-item-value')
          .textContent
          .split('+')[0]
          .split('→')[0]

        return id
      }


      static getVoxelSize() {
        return viewer.layerSpecification.voxelSize.size
      }


      static multiplyVec3(arg1, arg2) {
        return [arg1[0] * arg2[0], arg1[1] * arg2[1], arg1[2] * arg2[2]]
      }


      static divideVec3(arg1, arg2) {
        return [arg1[0] / arg2[0], arg1[1] / arg2[1], arg1[2] / arg2[2]]
      }

      
      // Source: \neuroglances\src\neuroglancer\util\random.ts
      static getRandomHexString(numBits = 128) {
        const numValues = Math.ceil(numBits / 32)
        const data = new Uint32Array(numValues)
        crypto.getRandomValues(data)
        let s = ''
        for (let i = 0; i < numValues; ++i) {
          s += ('00000000' + data[i].toString(16)).slice(-8)
        }
        return s
      }


      // Source: \neuroglancer\src\neuroglancer\annotation\annotation_layer_view.ts: AnnotationType
      static annotations = {
        type: {
          POINT: 0,
          LINE: 1,
          AXIS_ALIGNED_BOUNDING_BOX: 2,
          ELLIPSOID: 3,
          COLLECTION: 4,
          LINE_STRIP: 5,
          SPOKE: 6
        },
        
        getAnnotationLayer() {
          let doesAnnotationLayerExist = [...viewer.layerManager.layerSet].some(layer => layer.name === 'annotation')

          if (!doesAnnotationLayerExist) {
            document.getElementsByClassName('neuroglancer-layer-add-button')[0].dispatchEvent(new MouseEvent("click", {ctrlKey: true}));
          }

          let annotationLayer
          doesAnnotationLayerExist = [...viewer.layerManager.layerSet].some(layer => {
            if (layer.name === 'annotation') {
              annotationLayer = layer
              return true
            }
          })
          if (!doesAnnotationLayerExist) return false

          return annotationLayer.layer.annotationLayerState.value.source
        },

        getRef(id) {
          let annotationLayer = Dock.annotations.getAnnotationLayer()
          let references = annotationLayer.references

          for (const [refId, ref] of references) {
            if (refId === id) {
              return ref
            }
          }

          return false
        },

        getMulticutRef(field, value) {
          let graphLayer = Dock.layers.getByType('segmentation_with_graph', false)[0]
          let graphLayerState = graphLayer.layer.graphOperationLayerState.value
          let refId
          let sourceGroup = '';

          [...graphLayerState.annotationLayerStateA.value.source].forEach(el => {
            if (el[field] === value) {
              refId = el.id
              sourceGroup = 'A'
              return false
            }
          })
          
          if (!refId) {
            [...graphLayerState.annotationLayerStateB.value.source].forEach(el => {
              if (el[field] === value) {
                refId = el.id
                sourceGroup = 'B'
                return false
              }
            })
          }
        
          if (!sourceGroup) return null
        
          let annotationLayer = sourceGroup === 'A' ? graphLayerState.annotationLayerStateA : graphLayerState.annotationLayerStateB
          let source = annotationLayer.value.source
          let ref = source.getReference(refId)
        
          if (!ref) return null
        
          return {
            source: source,
            reference: ref
          }
        },

        add(coords, type = 0, description = '') {
          let annotationLayer = Dock.annotations.getAnnotationLayer()

          let ref = annotationLayer.add({point: coords, type: type})

          if (description) {
            annotationLayer.update(ref, {...ref.value, description: description})
          }

          return ref.id
        },

        editDescription(id, newDesc) {
          let ref = Dock.annotations.getRef(id)
          let annotationLayer = Dock.annotations.getAnnotationLayer()

          annotationLayer.update(ref, { ...ref.value, description: newDesc })
        },

        remove(id) {
          let ref = Dock.annotations.getRef(id)
          if (!ref) return

          let annotationLayer = Dock.annotations.getAnnotationLayer()
          annotationLayer.delete(ref)
        }
      }

      static dialog(options) {
        return new Dialog(options)
      }
 

      #createResizeDialog() {
        let size = Dock.ls.get('size', true)
        let width = size ? size.width : 400
        let height = size ? size.height : 200
        let id = 'kk-dock-resize-dialog'
        let minWidth = 50
        let maxWidth = 1000
        let minHeight = 30
        let maxHeight = 1000

        let resizeDialogHtml = /*html*/`
          <div class="grid">
            <span>width</span><input type="number" class="resize-width" value="${width}"></input>
            <span>height</span><input type="number" class="resize-height" value="${height}"></input>
          </div>
        `

        let resizeDialogCss = /*css*/`
          #${id} .grid {
            display: grid;
            grid-template-columns: 1fr 2fr;
            grid-column-gap: 0px;
            grid-row-gap: 0px;
          }

          #${id} .content > :first-child {
            grid-area: 1 / 1 / 2 / 2;
          }

          #${id} .content > :nth-child(2) {
            grid-area: 1 / 2 / 2 / 3;
          }

          #${id} .content > :nth-child(3) {
            grid-area: 2 / 1 / 3 / 2;
          }

          #${id} .content > :nth-child(4) {
            grid-area: 2 / 2 / 3 / 3;
          }

          #${id} .button-wrapper {
            grid-area: 3 / 1 / 4 / 3;
            text-align: center;
          }

          #${id} span {
            padding: 5px;
            color: #ccc;
          }
        `

        let resizeDialogOkCallback = () => {
          let width = parseInt(document.querySelector(`#${resizeDialog.id} .resize-width`).value, 10)
          let height = parseInt(document.querySelector(`#${resizeDialog.id} .resize-height`).value, 10)

          width = Math.min(Math.max(minWidth, width), maxWidth)
          height = Math.min(Math.max(minHeight, height), maxHeight)

          Dock.ls.set('size', { width: width, height: height }, true)
          Dock.element.style.width = width + 'px'
          Dock.element.style.height = height + 'px'
          if (this.#editable) {
            this.#resetGrid()
          }
        }

        let resizeDialog = Dock.dialog({
          html: resizeDialogHtml,
          css: resizeDialogCss,
          id: id,
          okCallback: resizeDialogOkCallback,
          cancelCallback: () => {}
        })

        return resizeDialog
      }


      static layers = {
        getByName: (name, withIndexes = true) => {
          let layers = []
          viewer.layerManager.managedLayers.forEach((layer, index) => {
            if (layer.name === name) {
              if (withIndexes) {
                layers.push({index: index, layer: layer})
              }
              else {
                layers.push(layer)
              }
            }
          })

          return layers
        },

        getByType: (type, withIndexes = true) => {
          let layers = []
          viewer.layerManager.managedLayers.forEach((layer, index) => {
            if (layer.initialSpecification.type === type) {
              if (withIndexes) {
                layers.push({index: index, layer: layer})
              }
              else {
                layers.push(layer)
              }
            }
          })

          return layers
        },

        getAll: () => {
          return viewer.layerManager.managedLayers
        },

        remove: index => {
          let manager = viewer.layerManager
          let layer = manager.managedLayers[index]
        
          layer.layerChanged.remove(manager.layersChanged.dispatch)
          layer.readyStateChanged.remove(manager.readyStateChanged.dispatch)
          layer.specificationChanged.remove(manager.specificationChanged.dispatch)
          layer.dispose()
          manager.managedLayers.splice(index, 1)
          manager.layerSet.delete(layer)
          manager.layersChanged.dispatch()
        }
      }
    }
    // END of Dock class

  function prepare() {
    // Dock.ls.get() isn't ready at this moment
    let size = localStorage.getItem(`${userId}-${DOCK_ID}-size`)
    let width = 400
    let height = 200
    if (size) {
      // Source: https://stackoverflow.com/a/51136281 (why braces)
      ({ width, height } = JSON.parse(size))
    }

    let dockElement = document.createElement('div')
    dockElement.id = DOCK_ID
    dockElement.style.width = width + 'px'
    dockElement.style.height = height + 'px'
    document.body.appendChild(dockElement)
    
    let waitForMenuCallback = () => {
      let menu = document.getElementsByClassName('nge-gs-links')
      if (!menu.length) return

      clearInterval(waitForMenu)

      let link = document.createElement('div')
      link.classList.add('nge-gs-link')
      link.innerHTML = '<button>Addons</button>'
      link.addEventListener('click', toggleAddonsWrapper)
      menu[0].appendChild(link)
    }

    let waitForMenu = setInterval(waitForMenuCallback, 100)

    return dockElement
  }

}
// END of main() function



class Dialog {
  #created = false
  #html
  #css
  #okCallback = null
  #cancelCallback = null
  #okLabel = 'OK'
  #cancelLabel = 'Cancel'
  #wrapper

  id

  constructor({ html, id, css, okCallback, cancelCallback, okLabel, cancelLabel }) {
    if (!content) return console.error('Dock.dialog: missing content')
    if (!id) return console.error('Dock.dialog: missing id')

    this.#html = html
    this.id = id
    this.#css = css
    this.#okCallback = okCallback
    okLabel && (this.#okLabel = okLabel)
    cancelLabel && (this.#cancelLabel = cancelLabel)
    this.#cancelCallback = cancelCallback
    this.#create()
  }


  #create() {
    this.#addStyles()

    this.#wrapper = document.createElement('div')
    this.#wrapper.id = this.id
    this.#wrapper.innerHTML = `<div class="content">${this.#html}</div><div class="button-wrapper"></div>`
    document.body.appendChild(this.#wrapper)

    let buttonTarget = this.#wrapper.getElementsByClassName('button-wrapper')[0]

    if (this.#okCallback) {
      let okButton = document.createElement('button')
      okButton.textContent = this.#okLabel
      buttonTarget.appendChild(okButton)
      okButton.addEventListener('click', () => this.#ok())
    }

    if (this.#cancelCallback) {
      let cancelButton = document.createElement('button')
      cancelButton.textContent = this.#cancelLabel
      buttonTarget.appendChild(cancelButton)
      cancelButton.addEventListener('click', () => this.#cancel())
    }
  }


  show() {
    this.#wrapper.style.display = 'block'
    document.getElementById('vueMain').style.filter = 'blur(10px)'
  }
  

  hide() {
    document.getElementById('vueMain').style.filter = ''
    this.#wrapper.style.display = 'none'
  }

  
  #ok() {
    this.#okCallback()
    this.hide()
  }


  #cancel() {
    this.#cancelCallback()
    this.hide()
  }


  #addStyles() {
    let style = document.createElement('style')
    style.type = 'text/css'
    style.textContent = (this.#css ? this.#css : '') + /*css*/`
      #${this.id} {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background-color: rgba(30, 30, 30, 0.80);
        color: white;
        z-index: 31;
        padding: 20px;
        border-radius: 4px;
        display: none;
        font-family: 'Roboto';
      }

      #${this.id} input[type="text"], 
      #${this.id} input[type="number"] {
        width: 100px;
        height: 20px;
        background-color: #222;
        border: 1px solid #5454d3;
        color: white;
      }

      #${this.id} .button-wrapper {
        min-width: 200px;
        margin-top: 10px;
        text-align: center;
      }

      #${this.id} button {
        width: 70px;
        height: 30px;
        background-color: #5454d3;
        color: white;
        border-radius: 4px;
        box-shadow: 0 0 0.2em #5454d3;
        border: none;
        margin-right: 8px;
      }

      #${this.id} button:hover {
        box-shadow: 0 0 0.5em #5454d3;
      }

      #${this.id} button:hover:active {
        box-shadow: 0 0 0.7em #5454d3;
      }
    `

    document.head.appendChild(style)
  }
}
// END of Dialog class



})()