(() => {
  const DOCK_ID = 'kk-dock'
  const WRAPPER_CLASS = DOCK_ID + '-addon-wrapper'
  let userId = ''

  if (globalThis.dockIsReady) return

  let waitUntilReady = setInterval(() => {
    userId = document.querySelector('#loggedInUserDropdown .nge-usercard-email')
    if (!userId) return

    clearInterval(waitUntilReady)
    // dockIsReady could be set in the meantime by another instance of the script
    if (globalThis.dockIsReady) return

    userId = userId.textContent
    main()
    globalThis.dockIsReady = true
  }, 100)

  
  let ls = {
    get(key) {
      return localStorage.getItem(`${userId}-${DOCK_ID}-${key}`)
    },
    set(key, value) {
      localStorage.setItem(`${userId}-${DOCK_ID}-${key}`, value)
    }
  }

  function main() {
    const dockElement = prepare()

    globalThis.Dock = class {
      static #instance = null
      static #container = {
        el: document.getElementById(DOCK_ID),
        style: null
      }
      static userId = userId

      gridSize = 15

      constructor() {
        if (!Dock.instance) {
          Dock.instance = this

          this.#addStyles()
          this.#createGrid()

          this.#creatPositionAddonsButton()
          this.#createResizeDockButton()
          this.editable = false
          this.grabbedAddon = null
          Dock.#container.style = window.getComputedStyle(Dock.#container.el)


          Dock.#container.el.addEventListener('mousedown', (e) => this.#editableMouseDownHandler(e))
          Dock.#container.el.addEventListener('mouseup'  , (e) => this.#editableMouseUpHandler(e))
          Dock.#container.el.addEventListener('mousemove', (e) => this.#editableMouseMoveHandler(e))
        }

        return Dock.instance
      }

      #editableMouseDownHandler(e) {
        if (!this.editable) return
        if (!e.target.classList.contains('legend') && !e.target.parentElement.classList.contains('legend')) return

        let addon = e.target
        while (!addon.classList.contains(WRAPPER_CLASS) || !addon.tagName === 'BODY') {
          addon = addon.parentElement
        }

        this.grabbedAddon = addon

        // Source: https://esstudio.site/2018/11/01/create-draggable-elements-with-javascript.html
        this.X = e.clientX - this.grabbedAddon.style.left.slice(0, -2);
        this.Y = e.clientY - this.grabbedAddon.style.top.slice(0, -2);
      }


      #editableMouseUpHandler(e) {
        if (!this.editable) return
        if (!this.grabbedAddon) return

        let x = this.grabbedAddon.offsetLeft
        let y = this.grabbedAddon.offsetTop
        ls.set('-addon-position-' + this.grabbedAddon.id, `{"x": ${x}, "y": ${y}}`)
        this.grabbedAddon = null
      }


      #editableMouseMoveHandler(e) {
        if (!this.editable) return
        if (!this.grabbedAddon) return

        // Source: https://esstudio.site/2018/11/01/create-draggable-elements-with-javascript.html
        this.grabbedAddon.style.left = Math.floor((e.clientX - this.X) / this.gridSize) * this.gridSize + 'px';
        this.grabbedAddon.style.top = Math.floor((e.clientY - this.Y) / this.gridSize) * this.gridSize + 'px';
      }


      #creatPositionAddonsButton() {
        let editButton = document.createElement('button')
        editButton.id = DOCK_ID + '-position-addons-button'
        editButton.textContent = 'A'
        editButton.addEventListener('click', () => this.#positionAddonsButtonHandle())
        Dock.#container.el.appendChild(editButton)
      }

      #createResizeDockButton() {
        let resizeButton = document.createElement('button')
        resizeButton.id = DOCK_ID + '-resize-dock-button'
        resizeButton.textContent = 'R'
        resizeButton.addEventListener('click', () => this.#resizeButtonHandle())
        Dock.#container.el.appendChild(resizeButton)
      }


      #positionAddonsButtonHandle() {
        this.#toggleGrid()
        this.editable = !this.editable
      }

      #resizeButtonHandle() {
        let size = ls.get('size')
        let width = 400
        let height = 200
        if (size) {
          [width, height] = JSON.parse(size)
        }

        let dialog = new ResizeDialog({
          width: width,
          height: height,
          okCallback: (newWidth, newHeight) => {
            let newSize = JSON.stringify({ width: newWidth, height: newHeight })
            ls.set('size', newSize)
            Dock.#container.el.style.width = newWidth + 'px'
            Dock.#container.el.style.height = newHeight + 'px'
          }
        })

        dialog.show()
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
            background-color: rgba(30, 30, 30, 0.95);
            position: absolute;
            top: 0;
            left: 0;
            z-index: 31;
            align-items: flex-start;
            flex-wrap: wrap;
            top: 0;
            left: 50%;
            transform: translateX(-50%);
            border-radius: 4px;
          }

          #${DOCK_ID}-position-addons-button,
          #${DOCK_ID}-resize-dock-button {
            position: absolute;
            top: 0;
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
            border: 1px solid rgba(30, 30, 30, 0.95);
          }

          #${DOCK_ID}-resize-dock-button {
            top: 15px;
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


      addAddon({ id, name, html, css, events }) {
        if (css) {
          css = `<style>${css}</style>`
          document.head.insertAdjacentHTML('beforeend', css)
        }

        if (html) {
          if (!name) return alert('Dock: Missing name')
          if (!id) return alert('Dock: missing ID')

          html = /*html*/`
            <div id="${id}" class="${WRAPPER_CLASS}">
              <div class="legend">
                <span>&nbsp;${name}&nbsp;</span>
              </div>
              ${html}
            </div>
          `

          Dock.#container.el.insertAdjacentHTML('beforeend', html)

          
          let position = ls.get('-addon-position-' + id)

          if (position) {
            position = JSON.parse(position)
            document.getElementById(id).style.left = position.x + 'px'
            document.getElementById(id).style.top = position.y + 'px'
          }
        }
        
        if (events) {
          for (const [selector, value] of Object.entries(events)) {
            for (const [event, listener] of Object.entries(value)) {
              document.querySelector(selector).addEventListener(event, e => listener(e))
            }
          }
        }
      }


      #createGrid() {
        let frag = document.createDocumentFragment()
        let wrapper = document.createElement('div')
        wrapper.id = DOCK_ID + '-grid'
        wrapper.style.display = 'none'
        frag = frag.appendChild(wrapper)

        dockElement.style.display = 'flex'
        let width = dockElement.offsetWidth
        let height = dockElement.offsetHeight
        dockElement.style.display = 'none'

        for (let i = 0; i <= width; i += this.gridSize) {
          let div = document.createElement('div')
          div.classList.add('vline')
          div.style.left = i + 'px'
          div.style.height = height + 'px'
          frag.appendChild(div)
        }

        for (let i = 0; i <= height; i += this.gridSize) {
          let div = document.createElement('div')
          div.classList.add('hline')
          div.style.top = i + 'px'
          div.style.width = width + 'px'
          frag.appendChild(div)
        }

        this.grid = dockElement.appendChild(frag)
      }


      #toggleGrid() {
        this.grid.style.display = window.getComputedStyle(this.grid).display === 'none' ? 'block' : 'none'        
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
      function toggleAddonsWraper() {
        // source why window.getComputedStyle(): https://stackoverflow.com/a/2298849
        dockElement.style.display = window.getComputedStyle(dockElement).display === 'none' ? 'flex' : 'none'
      }

      let size = ls.get('size')
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

      let waitForMenu = setInterval(() => {
        let menu = document.getElementsByClassName('nge-gs-links')
        if (!menu.length) return

        clearInterval(waitForMenu)

        let link = document.createElement('div')
        link.classList.add('nge-gs-link')
        link.innerHTML = '<button>Addons</button>'
        link.addEventListener('click', toggleAddonsWraper)
        menu[0].appendChild(link)
      }, 100)

      return dockElement
    }
  }

})()