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
      let isClosed = window.getComputedStyle(dockElement).display === 'none'
      dockElement.style.display = isClosed ? 'flex' : 'none'
      localStorage.setItem(`${userId}-${DOCK_ID}-is-closed`, isClosed)
    }


    globalThis.Dock = class {
      static #instance = null
      static #container = {
        el: document.getElementById(DOCK_ID),
        style: null
      }
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


      constructor() {
        if (Dock.instance) return Dock.instance

        Dock.instance = this

        this.#addStyles()
        this.#createGrid()
        this.#createAuxButtons()

        Dock.#container.el.addEventListener('mousedown', (e) => this.#editableMouseDownHandler(e))
        Dock.#container.el.addEventListener('mousemove', (e) => this.#editableMouseMoveHandler(e))
        Dock.#container.el.addEventListener('mouseup'  , (e) => this.#editableMouseUpHandler(e))
        if (Dock.ls.get('is-closed') !== 'false') {
          toggleAddonsWrapper()
        }

        this.#positionDock()
      }


      #createAuxButtons() {
        this.#createDockButton({
          id: 'organize-button',
          name: 'O',
          tooltip: 'Organize addons',
          handler: () => this.#organizeButtonHandler()
        })

        this.#createDockButton({
          id: 'resize-button',
          name: 'R',
          tooltip: 'Resize Dock',
          handler: () => this.#resizeButtonHandler()
        })
        
        let moveButton = this.#createDockButton({
          id: 'move-button',
          name: 'M',
          tooltip: 'Move Dock'
        })

        moveButton.addEventListener('mousedown', e => this.#moveButtonMouseDownHandler(e))
        document.addEventListener('mousemove', e => this.#moveButtonHandler(e))
        document.addEventListener('mouseup', e => this.#moveButtonMouseUpHandler(e))
      }


      #positionDock() {
        let dockPosition = Dock.ls.get('position', true)
        let dockElement = Dock.#container.el
        let dockElementStyle = dockElement.style
        if (!dockPosition) {
          let dockStyles = window.getComputedStyle(dockElement)
          dockElementStyle.top = 0
          let windowWidth = window.innerWidth
          let dockWidth = windowWidth - parseInt(dockStyles.width, 10)
          dockElementStyle.left = window.innerWidth / 2 - parseInt(dockStyles.width, 10) / 2 + 'px'
        }
        else {
          dockElementStyle.top = dockPosition.top
          dockElementStyle.left = dockPosition.left
        }
      }


      #moveButtonMouseDownHandler(e) {
        if (!e.buttons === 1) return

        let dockElement = Dock.#container.el
        let style = window.getComputedStyle(dockElement)

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
            top: Dock.#container.el.style.top,
            left: Dock.#container.el.style.left
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


      #createDockButton({ id, name, handler, tooltip = '' }) {
        let button = document.createElement('button')
        button.id = DOCK_ID + '-' + id
        button.textContent = name
        button.title = tooltip
        button.classList.add(DOCK_ID + '-aux-button')
        if (handler) {
          button.addEventListener('click', handler)
        }
        Dock.#container.el.appendChild(button)

        return button
      }


      #organizeButtonHandler() {
        this.#toggleGrid()
        this.#editable = !this.#editable
      }


      #resizeButtonHandler() {
        let size = Dock.ls.get('size', true)
        let width = size ? size.width : 400
        let height = size ? size.height : 200

        let dialog = new ResizeDialog({
          width: width,
          height: height,
          okCallback: (newWidth, newHeight) => {
            Dock.ls.set('size', { width: newWidth, height: newHeight }, true)
            Dock.#container.el.style.width = newWidth + 'px'
            Dock.#container.el.style.height = newHeight + 'px'
            if (this.#editable) {
              this.#resetGrid()
            }
          }
        })

        dialog.show()
      }

      #moveButtonHandler(e) {
        if (!this.#moving) return

        let mousePosition = { x: e.clientX, y: e.clientY }
        let dockElement = Dock.#container.el
        let style = window.getComputedStyle(dockElement)
        let dockPosition = { x: parseInt(style.left, 10), y: parseInt(style.top, 10) }
        let dockSize = { width: parseInt(style.width, 10), height: parseInt(style.height, 10) }

        let left = mousePosition.x - this.#movingDifference.x
        let top = mousePosition.y - this.#movingDifference.y
        if (left < 0) left = 0
        if (top < 0) top = 0
        if (left + dockSize.width > window.innerWidth) left = window.innerWidth - dockSize.width
        if (top + dockSize.height > window.innerHeight) top = window.innerHeight - dockSize.height
        dockElement.style.left = left + 'px'
        dockElement.style.top = top + 'px'
      }


      #addStyles() {
        let style = document.createElement('style')
        style.type = 'text/css'
        style.textContent = /*css*/`
          :root {
            --kk-dock-addon-button-color: #5454d3;
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
            document.querySelectorAll(selector).forEach(el => {
              el.addEventListener(eventName, e => listener(e))
            })
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

          Dock.#container.el.insertAdjacentHTML('beforeend', html)

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

        if (window.getComputedStyle(dockElement).display === 'none') {
          dockElement.style.display = 'flex'
          wasHidden = true
        }

        let width = dockElement.offsetWidth
        let height = dockElement.offsetHeight

        if (wasHidden) {
          dockElement.style.display = 'none'
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

        this.#grid = dockElement.appendChild(frag)
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
    }
    // END of Dock class

    class ResizeDialog {
      #id = DOCK_ID + '-resize-dialog'
      #widthId = this.#id + '-width'
      #heightId = this.#id + '-height'
      #width
      #height
      #okCallback
      #cancelCallback
      #minWidth = 50
      #maxWidth = 1000
      #minHeight = 30
      #maxHeight = 1000
      #stylesAdded = false

      constructor({ width, height, okCallback, cancelCallback }) {
        this.#width = width
        this.#height = height  
        this.#okCallback = okCallback || (() => {})
        this.#cancelCallback = cancelCallback || (() => {})
      }

      show() {
        if (!this.#stylesAdded) {
          this.#addStyles()
          this.#stylesAdded = true
        }

        let okId = this.#id + '-ok'
        let cancelId = this.#id + '-cancel'
        
        let dialog = document.createElement('div')
        dialog.id = this.#id
        dialog.innerHTML = /*html*/`
          <span>width</span><input type="number" id="${this.#widthId}" value="${this.#width}"></input>
          <span>height</span><input type="number" id="${this.#heightId}" value="${this.#height}"></input>
          <div class="button-wrapper">
            <button id="${okId}">Save</button>
            <button id="${cancelId}">Cancel</button>
          </div>
        `
        document.body.appendChild(dialog)

        document.getElementById(okId).addEventListener('click', () => this.#ok() )
        document.getElementById(cancelId).addEventListener('click', () => this.#cancel() )
      }

      #addStyles() {
        document.getElementById('vueMain').style.filter = 'blur(10px)'

        let style = document.createElement('style')
        style.type = 'text/css'
        style.textContent = /*css*/`
          #${this.#id} {
            width: 190px;
            height: 150px;
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: rgba(30, 30, 30, 0.80);
            color: white;
            z-index: 31;
            padding: 20px;
            border-radius: 4px;
            display: grid;
            grid-template-columns: 1fr 2fr;
            grid-template-rows: repeat(3, 1fr);
            grid-column-gap: 0px;
            grid-row-gap: 0px;
            font-family: 'Roboto';
          }

          #${this.#id} > :first-child {
            grid-area: 1 / 1 / 2 / 2;
          }

          #${this.#id} > :nth-child(2) {
            grid-area: 1 / 2 / 2 / 3;
          }

          #${this.#id} > :nth-child(3) {
            grid-area: 2 / 1 / 3 / 2;
          }

          #${this.#id} > :nth-child(4) {
            grid-area: 2 / 2 / 3 / 3;
          }

          #${this.#id} .button-wrapper {
            grid-area: 3 / 1 / 4 / 3;
            text-align: center;
          }

          #${this.#id} input {
            width: 100px;
            height: 20px;
            background-color: #222;
            border: 1px solid #5454d3;
            color: white;
          }

          #${this.#id} button {
            width: 70px;
            height: 30px;
            background-color: #5454d3;
            color: white;
            border-radius: 4px;
            box-shadow: 0 0 0.2em #5454d3;
            border: none;
            margin-right: 8px;
          }

          #${this.#id} button:hover {
            box-shadow: 0 0 0.5em #5454d3;
          }

          #${this.#id} button:hover:active {
            box-shadow: 0 0 0.7em #5454d3;
          }

          #${this.#id} span {
            padding: 5px;
            color: #ccc;
          }
        `

        document.head.appendChild(style)
      }

      #hide() {
        document.getElementById('vueMain').style.filter = ''
        document.getElementById(this.#id).remove()
      }

      #ok() {
        let width = parseInt(document.getElementById(this.#widthId).value, 10)
        let height = parseInt(document.getElementById(this.#heightId).value, 10)
        width = Math.min(Math.max(this.#minWidth, width), this.#maxWidth)
        height = Math.min(Math.max(this.#minHeight, height), this.#maxHeight)
        this.#okCallback(width, height)
        this.#hide()
      }

      #cancel() {
        this.#cancelCallback()
        this.#hide()
      }
    }
    // END of ResizeDialog class


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

})()
