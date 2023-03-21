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
              response: response,
              success: true
            }
          }))
        })
        .catch(err => {
          document.dispatchEvent(new CustomEvent('fetch', {
            detail: {
              url: args[0],
              params: args[1],
              response: { code: 0 },
              success: false,
              errMessage: err.message
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
      static element
      static userId = userId

      
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

        this.#prepare()
        this.#addMenuLink()
        this.#addStyles()
        this.#createGrid()
        this.#createAuxButtons()

        Dock.element.addEventListener('mousedown', (e) => this.#editableMouseDownHandler(e))
        Dock.element.addEventListener('mousemove', (e) => this.#editableMouseMoveHandler(e))
        Dock.element.addEventListener('mouseup'  , (e) => this.#editableMouseUpHandler(e))
        if (Dock.ls.get('is-closed') !== 'false') {
          toggleAddonsWrapper()
        }
        document.addEventListener('keydown', (e) => this.#toggleAddonVisibility(e))

        this.#positionDock()
        this.#resizeDialog = this.#createResizeDialog()
      }


      #toggleAddonVisibility(e) {
        if (!e.shiftKey || (e.key !== 'a' && e.key !== 'A')) return
        if (document.getElementById('chatMessage') === document.activeElement) return

        toggleAddonsWrapper()
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


      #prepare() {
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
        dockElement.style.display = 'none'
        document.body.appendChild(dockElement)

        Dock.element = dockElement
      }


      #addMenuLink() {
        let waitForMenuCallback = () => {
          let menu = document.getElementsByClassName('nge-gs-links')
          if (!menu.length) return
    
          clearInterval(waitForMenu)
    
          let link = document.createElement('div')
          link.classList.add('nge-gs-link')
          link.innerHTML = '<button title="Press Shift+A to toggle">Addons</button>'
          link.addEventListener('click', toggleAddonsWrapper)
          menu[0].appendChild(link)
        }
    
        let waitForMenu = setInterval(waitForMenuCallback, 100)
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
            let el = document.getElementById(id)
            let computedStyle = window.getComputedStyle(el)
            el.style.left = position.x - parseInt(computedStyle.marginLeft, 10) + 'px'
            el.style.top = position.y - parseInt(computedStyle.marginTop, 10) + 'px'
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


      // TODO: change name to getSegmentIdByCoords
      static getSegmentId(x, y, z, callback) {
        let isArray = Array.isArray(x)

        if (isArray) {
          x = x.join(',')
          y = y.join(',')
          z = z.join(',')
        }
        GM_xmlhttpRequest({
          method: 'POST',
          url: 'https://services.itanna.io/app/transform-service/query/dataset/flywire_190410/s/2/values_array_string_response',
          data: `{"x":[${x}],"y":[${y}],"z":[${z}]}`,
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          onload: response => {
            if (!response) return
            response = JSON.parse(response.response).values[0]
            callback(isArray ? response : response[0])
          }
        })
      }


      static getRootIdByCoords(x, y, z, callback) {
        Dock.getSegmentId(x, y, z, segmentId => {
          Dock.getRootId(segmentId, rootId => callback(rootId))
        })
      }


      static getRootId(supervoxelId, callback, returnPromise = false) {
        let authToken = localStorage.getItem('auth_token')
        let controller = new AbortController()
      
        let promise = fetch(`https://prodv1.flywire-daf.com/segmentation/api/v1/table/fly_v31/node/${supervoxelId}/root?int64_as_str=1&middle_auth_token=${authToken}`, { signal: controller.signal })

        if (!returnPromise) {
          promise
            .then(response => response.json())
            .then(response => {
              if (!response || !response.root_id || !callback) return
              callback(response.root_id)
            })
            .catch((error) => {
              callback(null)
            })

          return controller
        }

        return promise
      }


      static getRootIdByCurrentCoords(callback) {
        Dock.getRootIdByCoords(...Dock.getCurrentCoords(), rootId => callback(rootId))
      }


      static stringToUint64(s) {
        if (!s) return new Uint64(0, 0)

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

        return new Uint64(low, high)
      }

      
      static rgbToUint64(color) {
        let colorObj = color.substring(1)
        let r = parseInt(colorObj.substring(0, 2), 16)
        let g = parseInt(colorObj.substring(2, 4), 16)
        let b = parseInt(colorObj.substring(4, 6), 16)
        // color will always be below FFFFFFFF, so there's no need to convert it to Uint64

        return new Uint64(r * 256 * 256 + g * 256 + b, 0)
      }


      static getCurrentCoords() {
        // let coords = document
        //   .querySelector('.neuroglancer-position-widget-input')
        //   .value
        //   .split(',')
        //   .map(el => el.trim())

        // return coords
        let coords = [...viewer.navigationState.pose.position.spatialCoordinates]
        let voxelSize = Dock.getVoxelSize()

        return [coords[0] / voxelSize[0], coords[1] / voxelSize[1], coords[2] / voxelSize[2]]
      }

      
      static jumpToCoords(coords) {
        let voxelSize = Dock.getVoxelSize()
        coords = Dock.multiplyVec3(coords, voxelSize)
        viewer.layerSpecification.setSpatialCoordinates(coords)
      }

      //// TODO: check: viewer.mouseState.position
      static getCurrentMouseCoords() {
        // let coords = document
        //   .querySelector('.neuroglancer-mouse-position-widget')
        //   .textContent
        //   .split(',')
        //   .map(el => el.trim().split(' ')[1])

        // return coords
        let mousePos = [...viewer.mouseState.position]
        let voxelSize = Dock.getVoxelSize()

        return [mousePos[0] / voxelSize[0], mousePos[1] / voxelSize[1], mousePos[2] / voxelSize[2]]
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

      
      // Source: \neuroglancer\src\neuroglancer\util\random.ts
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


      static getRandomAlphaString(numChars = 16) {
        const chars = 'abcdefghijklmnopqurstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
        let s = ''

        for (let i = 0; i < numChars; ++i) {
          const index = Math.floor(Math.random() * chars.length)
          s += chars[index]
        }

        return s
      }

      
      // Source: https://stackoverflow.com/a/1152508
      static getRandomColor() {
        return '#' + (0x1000000 + Math.random() * 0xffffff).toString(16).substr(1, 6)
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
          
          if (!annotationLayer) return false

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


      static addCss(css) {
        const style = document.createElement('style')
        style.type = 'text/css'
        style.textContent = css
        document.head.appendChild(style)
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
          #${id} {
            position: relative;
          }
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
          width: 170,
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


      static getShareableUrl(callback) {
        fetch(viewer.jsonStateServer.value + '?middle_auth_token=' + localStorage.getItem('auth_token'), {
          method: 'POST',
          body: JSON.stringify(viewer.state.toJSON())
        })
          .then(res => res.json())
          .then(response => {
            callback && callback('https://ngl.flywire.ai/?json_url=' + response)
          })
      }


      
      static #merge(target, key, value) {
        let types = ['number', 'string', 'boolean', 'undefined', 'bigint']
        let typeOfValue = typeof value

        let nonExistent = typeof target[key] === 'undefined'
        let isNull = value === null
        let isPrimitive = types.includes(typeOfValue)
        let isUndefined = value === undefined

        if (nonExistent || isPrimitive || isUndefined) {
          target[key] = value
        }
        // because JSON can't store undefined, we have to convert them to null when writing
        // and then converting back to undefined at reading
        if (isNull) {
          target[key] = undefined
        }
        else if (Array.isArray(value)) {
          if (!target[key]) {
            target[key] = []
          }
          value.forEach((el, index) => Dock.#merge(target[key], index, el))
        }
        else if (typeOfValue === 'object') {
          Dock.mergeObjects(target[key], value)
        }
      }


      static mergeObjects(target, source) {
        for (const [key, value] of Object.entries(source)) {
          Dock.#merge(target, key, value)
        }
      }


      static addToRightTab(topTab, rightTab, callback) {
        const id = Dock.getRandomAlphaString().toUpperCase()
        const layer = viewer.selectedLayer
        if (!layer || !layer.layer) return

        checkTabAndAddIfCorrect()
        layer.changed.add(checkTabAndAddIfCorrect)

        function checkTabAndAddIfCorrect() {
          if (!layer || !layer.layer || !layer.layer.initialSpecification) return

          const tabs = layer.layer.layer.tabs
          const topTabValue = layer.layer.initialSpecification.type
          const rightTabValue = tabs.selectedValue || tabs.defaultValue
          const isCorrectTab = (topTabValue === topTab) && (rightTabValue === rightTab.toLowerCase())
          if (!isCorrectTab) return

          const tabNode = document.getElementsByClassName('neuroglancer-selected-tab-label')[0]
          if (!tabNode) return

          const alreadySet = tabNode && tabNode.dataset && tabNode.dataset['kkUtils' + id] === id
          if (alreadySet) return

            tabNode.dataset['kkUtils' + id] = id
            callback()
        }
      }

      static addToMainTab(tab, callback) {
        const id = Dock.getRandomAlphaString().toUpperCase()
        const layer = viewer.selectedLayer
        if (!layer || !layer.layer) return

        checkLayerAndAddIfCorrect()
        layer.changed.add(checkLayerAndAddIfCorrect)

        function checkLayerAndAddIfCorrect() {
          if (!layer || !layer.layer || !layer.layer.initialSpecification) return
          
          const isCorrectLayer = layer.layer.initialSpecification.type === tab
          if (!isCorrectLayer) return

          const node = document.querySelector('div[data-type="' + tab + '"]')
          const alreadySet = node && node.dataset && node.dataset['kkUtils' + id] === id
          
          if (alreadySet) return
          
          node.dataset['kkUtils' + id] = id
          callback()
        }
      }

      
      // Source: ChatGPT
      static arraySubtraction(array1, array2) {
        const result = [];

        for (let i = 0; i < array1.length; i++) {
          if (!array2.includes(array1[i])) {
            result.push(array1[i]);
          }
        }

        return result;
      }
    }
    // END of Dock class
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
  #destroyAfterClosing = false
  #width = 200
  #overlay

  id

  constructor({ html, id, css, okCallback, cancelCallback, okLabel = 'OK', cancelLabel = 'Cancel', afterCreateCallback: afterCreateCallback, destroyAfterClosing = false, width = 200 }) {
    // if (!content) return console.error('Dock.dialog: missing content') // ???
    if (!id) return console.error('Dock.dialog: missing id')

    this.#html = html
    this.id = id
    this.#css = css
    this.#okCallback = okCallback
    this.#okLabel = okLabel
    this.#cancelCallback = cancelCallback
    this.#cancelLabel = cancelLabel
    this.#destroyAfterClosing = destroyAfterClosing
    this.#width = width
    this.#create()
    afterCreateCallback && afterCreateCallback()
  }


  #create() {
    this.#addStyles()

    this.#overlay = document.createElement('div')
    this.#overlay.id = (this.id + '-kk-dialog-overlay')
    this.#wrapper = document.createElement('div')
    this.#overlay.appendChild(this.#wrapper)
    this.#wrapper.id = this.id
    this.#wrapper.style.width = this.#width + (typeof this.#width === 'number' ? 'px' : '')
    this.#wrapper.innerHTML = `<div class="content">${this.#html}</div><div class="button-wrapper"></div>`
    document.body.appendChild(this.#overlay)

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

    this.#overlay.addEventListener('click', e => {
      if (e.target !== e.currentTarget) return
      this.#cancel()
    })
  }


  show() {
    this.#wrapper.parentNode.style.display = 'block'
  }
  

  hide() {
    this.#wrapper.parentNode.style.display = 'none'
    this.#destroyAfterClosing && this.#destroy()
  }

  // TODO: add ability to check fields and display errors, if something is wrong. Don't close the dialog, if there are errors. okCallback should return a bool
  #ok() {
    this.#okCallback && this.#okCallback()
    this.hide()
  }


  #cancel() {
    this.#cancelCallback && this.#cancelCallback()
    this.hide()
  }
  

  #destroy() {
    document.getElementById(this.id).parentNode.remove()
  }


  #addStyles() {
    let style = document.createElement('style')
    style.type = 'text/css'
    style.textContent = (this.#css ? this.#css : '') + /*css*/`
      #${this.id} {
        position: relative;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background-color: rgba(30, 30, 30, 0.80);
        color: white;
        z-index: 31;
        padding: 20px;
        border-radius: 4px;
        font-family: 'Roboto';
        display: block;
      }

      #${this.id} .content {
        height: 95%;
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
        min-width: ${this.#width}px;
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
        cursor: pointer;
      }

      #${this.id} button:hover {
        box-shadow: 0 0 0.5em #5454d3;
      }

      #${this.id} button:hover:active {
        box-shadow: 0 0 0.7em #5454d3;
      }

      #${this.id}-kk-dialog-overlay {
        position: fixed;
        top: -1000px;
        bottom: -1000px;
        left: -1000px;
        right: -1000px;
        z-index: 80;
        background-color: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(10px);
        display: none;
      }
    `

    document.head.appendChild(style)
  }
}
// END of Dialog class



})()






/*! Sifrr.Storage v0.0.9 - sifrr project | MIT licensed | https://github.com/sifrr/sifrr */
this.Sifrr=this.Sifrr||{},this.Sifrr.Storage=function(t){"use strict";var e=Object.prototype.toString,r="~SS%l3g5k3~";function s(t){var e=t;if("string"==typeof t)try{e=t=JSON.parse(t)}catch(t){// do nothing
}if("string"==typeof t&&t.indexOf(r)>0){var[n,i,a]=t.split(r);e="ArrayBuffer"===n?new Uint8Array(i.split(",").map(t=>parseInt(t))).buffer:"Blob"===n?function(t,e){return new Blob([new Uint8Array(t.split(",")).buffer],{type:e})}(a,i):new window[n](i.split(","))}else if(Array.isArray(t))e=[],t.forEach((t,r)=>{e[r]=s(t)});else if("object"==typeof t){if(null===t)return null;for(var o in e={},t)e[o]=s(t[o])}return e}function n(t){if("object"!=typeof t)return JSON.stringify(t);if(null===t)return"null";if(Array.isArray(t))return JSON.stringify(t.map(t=>n(t)));var s=e.call(t).slice(8,-1);if("Object"===s){var i={};for(var a in t)i[a]=n(t[a]);return JSON.stringify(i)}return"ArrayBuffer"===s?t=new Uint8Array(t):"Blob"===s&&(t=t.type+r+function(t){var e=URL.createObjectURL(t),r=new XMLHttpRequest;r.open("GET",e,!1),r.send(),URL.revokeObjectURL(e);for(var s=new Uint8Array(r.response.length),n=0;n<r.response.length;++n)s[n]=r.response.charCodeAt(n);return s.toString()}(t)),s+r+t.toString()}
// always bind to storage
var i=(t,e)=>{var r=Date.now();return Object.keys(t).forEach(s=>{if(void 0!==t[s]){var{createdAt:n,ttl:i}=t[s];t[s]=t[s]&&t[s].value,0!==i&&r-n>i&&(delete t[s],e&&e(s))}}),t},a=(t,e)=>t&&t.value?(t.ttl=t.ttl||e,t.createdAt=Date.now(),t):{value:t,ttl:e,createdAt:Date.now()},o=(t,e,r)=>{if("string"==typeof t)return{[t]:a(e,r)};var s={};return Object.keys(t).forEach(e=>s[e]=a(t[e],r)),s},c=t=>Array.isArray(t)?t:[t],l={name:"SifrrStorage",version:1,description:"Sifrr Storage",size:5242880,ttl:0};class u{constructor(t=l){this.type=this.constructor.type,this.table={},Object.assign(this,l,t),this.tableName=this.name+this.version}// overwrited methods
select(t){var e=this.getStore(),r={};return t.forEach(t=>r[t]=e[t]),r}upsert(t){var e=this.getStore();for(var r in t)e[r]=t[r];return this.setStore(e),!0}delete(t){var e=this.getStore();return t.forEach(t=>delete e[t]),this.setStore(e),!0}deleteAll(){return this.setStore({}),!0}getStore(){return this.table}setStore(t){this.table=t}keys(){return Promise.resolve(this.getStore()).then(t=>Object.keys(t))}all(){return Promise.resolve(this.getStore()).then(t=>i(t,this.del.bind(this)))}get(t){return Promise.resolve(this.select(c(t))).then(t=>i(t,this.del.bind(this)))}set(t,e){return Promise.resolve(this.upsert(o(t,e,this.ttl)))}del(t){return Promise.resolve(this.delete(c(t)))}clear(){return Promise.resolve(this.deleteAll())}memoize(t,e=((...t)=>"string"==typeof t[0]?t[0]:n(t[0]))){return(...r)=>{var s=e(...r);return this.get(s).then(e=>{if(void 0===e[s]||null===e[s]){var n=t(...r);if(!(n instanceof Promise))throw Error("Only promise returning functions can be memoized");return n.then(t=>this.set(s,t).then(()=>t))}return e[s]})}}isSupported(t=!0){return!(!t||"undefined"!=typeof window&&"undefined"!=typeof document)||!(!window||!this.hasStore())}hasStore(){return!0}isEqual(t){return this.tableName==t.tableName&&this.type==t.type}// aliases
static stringify(t){return n(t)}static parse(t){return s(t)}static _add(t){this._all=this._all||[],this._all.push(t)}static _matchingInstance(t){for(var e=this._all||[],r=e.length,s=0;s<r;s++)if(e[s].isEqual(t))return e[s];return this._add(t),t}}class h extends u{constructor(t){return super(t),this.constructor._matchingInstance(this)}select(t){var e={},r=[];return t.forEach(t=>r.push(this._tx("readonly","get",t,void 0).then(r=>e[t]=r))),Promise.all(r).then(()=>e)}upsert(t){var e=[];for(var r in t)e.push(this._tx("readwrite","put",t[r],r));return Promise.all(e).then(()=>!0)}delete(t){var e=[];return t.forEach(t=>e.push(this._tx("readwrite","delete",t,void 0))),Promise.all(e).then(()=>!0)}deleteAll(){return this._tx("readwrite","clear",void 0,void 0)}_tx(t,e,r,s){var n=this;return this.store=this.store||this.createStore(n.tableName),this.store.then(i=>new Promise((a,o)=>{var c=i.transaction(n.tableName,t).objectStore(n.tableName),l=c[e].call(c,r,s);l.onsuccess=t=>a(t.target.result),l.onerror=t=>o(t.error)}))}getStore(){return this._tx("readonly","getAllKeys",void 0,void 0).then(this.select.bind(this))}createStore(t){return new Promise((e,r)=>{var s=window.indexedDB.open(t,1);s.onupgradeneeded=()=>{s.result.createObjectStore(t)},s.onsuccess=()=>e(s.result),s.onerror=()=>r(s.error)})}hasStore(){return!!window.indexedDB}static get type(){return"indexeddb"}}class p extends u{constructor(t){return super(t),this.constructor._matchingInstance(this)}parsedData(){}select(t){var e=t.map(()=>"?").join(", ");// Need to give array for ? values in executeSql's 2nd argument
return this.execSql("SELECT key, value FROM ".concat(this.tableName," WHERE key in (").concat(e,")"),t)}upsert(t){return this.getWebsql().transaction(e=>{for(var r in t)e.executeSql("INSERT OR REPLACE INTO ".concat(this.tableName,"(key, value) VALUES (?, ?)"),[r,this.constructor.stringify(t[r])])}),!0}delete(t){var e=t.map(()=>"?").join(", ");return this.execSql("DELETE FROM ".concat(this.tableName," WHERE key in (").concat(e,")"),t),!0}deleteAll(){return this.execSql("DELETE FROM ".concat(this.tableName)),!0}getStore(){return this.execSql("SELECT key, value FROM ".concat(this.tableName))}hasStore(){return!!window.openDatabase}getWebsql(){return this._store?this._store:(this._store=window.openDatabase("ss",1,this.description,this.size),this.execSql("CREATE TABLE IF NOT EXISTS ".concat(this.tableName," (key unique, value)")),this._store)}execSql(t,e=[]){var r=this;return new Promise(s=>{r.getWebsql().transaction((function(n){n.executeSql(t,e,(t,e)=>{s(r.parseResults(e))})}))})}parseResults(t){for(var e={},r=t.rows.length,s=0;s<r;s++)e[t.rows.item(s).key]=this.constructor.parse(t.rows.item(s).value);return e}static get type(){return"websql"}}class d extends u{constructor(t){return super(t),this.constructor._matchingInstance(this)}select(t){var e={};return t.forEach(t=>{var r=this.constructor.parse(this.getLocalStorage().getItem(this.tableName+"/"+t));null!==r&&(e[t]=r)}),e}upsert(t){for(var e in t)this.getLocalStorage().setItem(this.tableName+"/"+e,this.constructor.stringify(t[e]));return!0}delete(t){return t.map(t=>this.getLocalStorage().removeItem(this.tableName+"/"+t)),!0}deleteAll(){return Object.keys(this.getLocalStorage()).forEach(t=>{0===t.indexOf(this.tableName)&&this.getLocalStorage().removeItem(t)}),!0}getStore(){return this.select(Object.keys(this.getLocalStorage()).map(t=>{if(0===t.indexOf(this.tableName))return t.slice(this.tableName.length+1)}).filter(t=>void 0!==t))}getLocalStorage(){return window.localStorage}hasStore(){return!!window.localStorage}static get type(){return"localstorage"}}var f=new Date(0).toUTCString(),g="%3D",S=new RegExp(g,"g");class v extends u{constructor(t){return super(t),this.constructor._matchingInstance(this)}upsert(t){for(var e in t)this.setStore("".concat(this.tableName,"/").concat(e,"=").concat(this.constructor.stringify(t[e]).replace(/=/g,g),"; path=/"));return!0}delete(t){return t.forEach(t=>this.setStore("".concat(this.tableName,"/").concat(t,"=; expires=").concat(f,"; path=/"))),!0}deleteAll(){return this.keys().then(this.delete.bind(this))}getStore(){var t=document.cookie,e={};return t.split("; ").forEach(t=>{var[r,s]=t.split("=");0===r.indexOf(this.tableName)&&(e[r.slice(this.tableName.length+1)]=this.constructor.parse(s.replace(S,"=")))}),e}setStore(t){document.cookie=t}hasStore(){return void 0!==document.cookie}static get type(){return"cookies"}}class y extends u{constructor(t){return super(t),this.constructor._matchingInstance(this)}hasStore(){return!0}static get type(){return"jsonstorage"}}var m={[h.type]:h,[p.type]:p,[d.type]:d,[v.type]:v,[y.type]:y};return t.Cookies=v,t.IndexedDB=h,t.JsonStorage=y,t.LocalStorage=d,t.WebSQL=p,t.availableStores=m,t.getStorage=function(t){return function(t=[],e={}){t=t.concat([h.type,p.type,d.type,v.type,y.type]);for(var r=0;r<t.length;r++){var s=m[t[r]];if(s){var n=new s(e);if(n.isSupported())return n}}throw Error("No compatible storage found. Available types: "+Object.keys(m).join(", ")+".")}("string"==typeof t?[t]:(t||{}).priority,"string"==typeof t?{}:t)},t.default&&(t=t.default),t}({});
/*! (c) @aadityataparia */



// Source: neuroglancer -> util -> uint64.ts

const randomTempBuffer = new Uint32Array(2);

const trueBase = 0x100000000;

let stringConversionData = [];
for (let base = 2; base <= 36; ++base) {
  let lowDigits = Math.floor(32 / Math.log2(base));
  let lowBase = Math.pow(base, lowDigits);
  let patternString = `^[0-${String.fromCharCode('0'.charCodeAt(0) + Math.min(9, base - 1))}`;
  if (base > 10) {
    patternString += `a-${String.fromCharCode('a'.charCodeAt(0) + base - 11)}`;
    patternString += `A-${String.fromCharCode('A'.charCodeAt(0) + base - 11)}`;
  }
  let maxDigits = Math.ceil(64 / Math.log2(base));
  patternString += `]{1,${maxDigits}}$`;
  let pattern = new RegExp(patternString);
  stringConversionData[base] = {lowDigits, lowBase, pattern};
}


function uint32MultiplyHigh(a, b) {
  a >>>= 0;
  b >>>= 0;

  const a00 = a & 0xFFFF, a16 = a >>> 16;
  const b00 = b & 0xFFFF, b16 = b >>> 16;

  let c00 = a00 * b00;
  let c16 = (c00 >>> 16) + (a16 * b00);
  let c32 = c16 >>> 16;
  c16 = (c16 & 0xFFFF) + (a00 * b16);
  c32 += c16 >>> 16;
  let c48 = c32 >>> 16;
  c32 = (c32 & 0xFFFF) + (a16 * b16);
  c48 += c32 >>> 16;

  return (((c48 & 0xFFFF) << 16) | (c32 & 0xFFFF)) >>> 0;
}


class Uint64 {
  low = 0
  high = 0

  constructor(low, high) {
    if (typeof low === 'string' && typeof high === 'undefined') {
      this.low = 0
      this.high = 0
      this.tryParseString(low)
    }
    else {
      if (typeof low === 'undefined') {
        low = 0
      }

      if (typeof high === 'undefined') {
        high = 0
      }

      this.low = low
      this.high = high
    }
  }

  clone() {
    return new Uint64(this.low, this.high);
  }

  assign(x) {
    this.low = x.low;
    this.high = x.high;
  }

  toString(base = 10) {
    let vLow = this.low, vHigh = this.high;
    if (vHigh === 0) {
      return vLow.toString(base);
    }
    vHigh *= trueBase;
    let {lowBase, lowDigits} = stringConversionData[base];
    let vHighExtra = vHigh % lowBase;
    vHigh = Math.floor(vHigh / lowBase);
    vLow += vHighExtra;
    vHigh += Math.floor(vLow / lowBase);
    vLow = vLow % lowBase;
    let vLowStr = vLow.toString(base);
    return vHigh.toString(base) + '0'.repeat(lowDigits - vLowStr.length) + vLowStr;
  }

  /**
   * Returns true if a is strictly less than b.
   */
  static less(a, b) {
    return a.high < b.high || (a.high === b.high && a.low < b.low);
  }

  /**
   * Returns a negative number if a is strictly less than b, 0 if a is equal to b, or a positive
   * number if a is strictly greater than b.
   */
  static compare(a, b) {
    return (a.high - b.high) || (a.low - b.low);
  }

  static ZERO = new Uint64(0, 0);
  static ONE = new Uint64(1, 0);

  static equal(a, b) {
    return a.low === b.low && a.high === b.high;
  }

  static min(a, b) {
    return Uint64.less(a, b) ? a : b;
  }

  static max(a, b) {
    return Uint64.less(a, b) ? b : a;
  }

  static random() {
    crypto.getRandomValues(randomTempBuffer);
    return new Uint64(randomTempBuffer[0], randomTempBuffer[1]);
  }

  tryParseString(s, base = 10) {
    const {lowDigits, lowBase, pattern} = stringConversionData[base];
    if (!pattern.test(s)) {
      return false;
    }
    if (s.length <= lowDigits) {
      this.low = parseInt(s, base);
      this.high = 0;
      return true;
    }
    const splitPoint = s.length - lowDigits;
    const lowPrime = parseInt(s.substr(splitPoint), base);
    const highPrime = parseInt(s.substr(0, splitPoint), base);

    let high, low;

    if (lowBase === trueBase) {
      high = highPrime;
      low = lowPrime;
    } else {
      const highRemainder = Math.imul(highPrime, lowBase) >>> 0;
      high = uint32MultiplyHigh(highPrime, lowBase) +
          (Math.imul(Math.floor(highPrime / trueBase), lowBase) >>> 0);
      low = lowPrime + highRemainder;
      if (low >= trueBase) {
        ++high;
        low -= trueBase;
      }
    }
    if ((low >>> 0) !== low || ((high >>> 0) !== high)) {
      return false;
    }
    this.low = low;
    this.high = high;

    return true;
  }

  parseString(s, base = 10) {
    if (!this.tryParseString(s, base)) {
      throw new Error(`Failed to parse string as uint64 value: ${JSON.stringify(s)}.`);
    }
    return this;
  }

  static parseString(s, base = 10) {
    let x = new Uint64();
    return x.parseString(s, base);
  }

  valid() {
    let {low, high} = this;
    return ((low >>> 0) === low) && ((high >>> 0) === high);
  }

  toJSON() {
    return this.toString();
  }

  static lshift(out, input, bits) {
    const {low, high} = input;
    if (bits === 0) {
      out.low = low;
      out.high = high;
    } else if (bits < 32) {
      out.low = low << bits;
      out.high = (high << bits) | (low >>> (32 - bits));
    } else {
      out.low = 0;
      out.high = low << (bits - 32);
    }
    return out;
  }

  static rshift(out, input, bits) {
    const {low, high} = input;
    if (bits === 0) {
      out.low = low;
      out.high = high;
    } else if (bits < 32) {
      out.low = (low >>> bits) | (high << (32 - bits));
      out.high = high >>> bits;
    } else {
      out.low = high >>> (bits - 32);
      out.high = 0;
    }
    return out;
  }

  static or(out, a, b) {
    out.low = a.low | b.low;
    out.high = a.high | b.high;
    return out;
  }

  static xor(out, a, b) {
    out.low = a.low ^ b.low;
    out.high = a.high ^ b.high;
    return out;
  }

  static and(out, a, b) {
    out.low = a.low & b.low;
    out.high = a.high & b.high;
    return out;
  }

  static add(out, a, b) {
    let lowSum = a.low + b.low;
    let highSum = a.high + b.high;
    const low = lowSum >>> 0;
    if (low !== lowSum) highSum += 1;
    out.low = low;
    out.high = highSum >>> 0;
    return out;
  }

  static addUint32(out, a, b) {
    let lowSum = a.low + b;
    let highSum = a.high;
    const low = lowSum >>> 0;
    if (low !== lowSum) highSum += 1;
    out.low = low;
    out.high = highSum >>> 0;
    return out;
  }

  static decrement(out, input) {
    let {low, high} = input;
    if (low === 0) {
      high -= 1;
    }
    out.low = (low - 1) >>> 0;
    out.high = high >>> 0;
    return out;
  }

  static increment(out, input) {
    let {low, high} = input;
    if (low === 0xFFFFFFFF) high += 1;
    out.low = (low + 1) >>> 0;
    out.high = high >>> 0;
    return out;
  }

  static subtract(out, a, b) {
    let lowSum = a.low - b.low;
    let highSum = a.high - b.high;
    const low = lowSum >>> 0;
    if (low !== lowSum) highSum -= 1;
    out.low = low;
    out.high = highSum >>> 0;
    return out;
  }

  static multiplyUint32(out, a, b) {
    const {low, high} = a;
    out.low = Math.imul(low, b) >>> 0;
    out.high = (Math.imul(high, b) + uint32MultiplyHigh(low, b)) >>> 0;
    return out;
  }

  static lowMask(out, bits) {
    if (bits <= 32) {
      out.high = 0;
      out.low = 0xffffffff >>> (32 - bits);
    } else {
      out.high = 0xffffffff >>> (bits - 32);
      out.low = 0xffffffff;
    }
    return out;
  }
}



