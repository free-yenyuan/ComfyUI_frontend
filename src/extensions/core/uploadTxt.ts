import { app } from '../../scripts/app'
import { api } from '../../scripts/api'
import type { IWidget } from '@comfyorg/litegraph'
import type { DOMWidget } from '@/scripts/domWidget'
import { ComfyNodeDef } from '@/types/apiTypes'

type FolderType = 'input' | 'output' | 'temp'

function splitFilePath(path: string): [string, string] {
  const folder_separator = path.lastIndexOf('/')
  if (folder_separator === -1) {
    return ['', path]
  }
  return [
    path.substring(0, folder_separator),
    path.substring(folder_separator + 1)
  ]
}

function getResourceURL(
  subfolder: string,
  filename: string,
  type: FolderType = 'input'
): string {
  const params = [
    'filename=' + encodeURIComponent(filename),
    'type=' + type,
    'subfolder=' + subfolder,
    app.getRandParam().substring(1)
  ].join('&')

  return `/view?${params}`
}

async function uploadFile(
  txtWidget: IWidget,
  txtUIWidget: DOMWidget<HTMLTextAreaElement>,
  file: File,
  updateNode: boolean,
  pasted: boolean = false
) {
  try {
    const body = new FormData()
    body.append('image', file)
    if (pasted) body.append('subfolder', 'pasted')
    const resp = await api.fetchApi('/upload/image', { method: 'POST', body })

    if (resp.status === 200) {
      const data = await resp.json()
      let path = data.name
      if (data.subfolder) path = data.subfolder + '/' + path
      if (!txtWidget.options.values.includes(path)) {
        txtWidget.options.values.push(path)
      }

      if (updateNode) {
        txtWidget.value = path
      } else {
        alert(resp.status + ' - ' + resp.statusText)
      }
    }
  } catch (error) {
    alert(error)
  }
}

app.registerExtension({
  name: 'Comfy.TxtWidget',
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (['Script Loader'].includes(nodeType.comfyClass)) {
      nodeData.input.required.txtUI = ['TXT_UI']
    }
  },
  getCustomWidgets() {
    return {
      TXT_UI(node, inputName: string) {
        const txt = document.createElement('textarea')
        txt.classList.add('comfy-txt')
        txt.setAttribute('name', 'text')

        const txtUIWidget: DOMWidget<HTMLTextAreaElement> = node.addDOMWidget(
          inputName,
          'txtUI',
          txt
        )

        const isOutputNode = node.constructor.nodeData.output_node
        if (isOutputNode) {
          //   txtUIWidget.element.classList.add('empty-txt-widget')
          const onExecuted = node.onExecuted
          node.onExecuted = function (message) {
            onExecuted?.apply(this, arguments)
            const text = message.text
            if (!text) return
            txtUIWidget.element.value = text
            txtUIWidget.element.classList.remove('empty-txt-widget')
          }
        }
        return { widget: txtUIWidget }
      }
    }
  },
  onNodeOutputsUpdated(nodeOutputs: Record<number, any>) {
    for (const [nodeId, output] of Object.entries(nodeOutputs)) {
      const node = app.graph.getNodeById(Number.parseInt(nodeId))
      if ('text' in output) {
        const txtUIWidget = node.widgets.find(
          (w) => w.name === 'txtUI'
        ) as unknown as DOMWidget<HTMLTextAreaElement>
        const text = output.text
        txtUIWidget.element.value = text
        txtUIWidget.element.classList.remove('empty-txt-widget')
      }
    }
  }
})

app.registerExtension({
  name: 'Comfy.UploadTxt',
  async beforeRegisterNodeDef(nodeType, nodeData: ComfyNodeDef) {
    if (nodeData?.input?.required?.txt?.[1]?.txt_upload === true) {
      nodeData.input.required.upload = ['TXTUPLOAD']
    }
  },
  getCustomWidgets() {
    return {
      TXTUPLOAD(node, inputName: string) {
        // 允许用户选择文件的小部件
        const txtWidget: IWidget = node.widgets.find(
          (w: IWidget) => w.name === 'txt'
        )
        const txtUIWidget: DOMWidget<HTMLTextAreaElement> = node.widgets.find(
          (w: IWidget) => w.name === 'txtUI'
        )

        const onTxtWidgetUpdate = () => {
          txtUIWidget.element.value = txtWidget.value
        }

        //todo: 恢复文本
        // 初始化时加载默认文本到 txtUIWidget
        if (txtWidget.value) {
          onTxtWidgetUpdate()
        }
        txtWidget.callback = onTxtWidgetUpdate

        // 如果从工作流中恢复,加载保存的文本值
        const onGraphConfigured = node.onGraphConfigured
        node.onGraphConfigured = function () {
          onGraphConfigured?.apply(this, arguments)
          if (txtWidget.value) {
            onTxtWidgetUpdate()
          }
        }

        const fileInput = document.createElement('input')
        fileInput.type = 'file'
        fileInput.accept = '.txt'
        fileInput.style.display = 'none'
        fileInput.onchange = () => {
          if (fileInput.files.length) {
            uploadFile(txtWidget, txtUIWidget, fileInput.files[0], true)
          }
        }
        // 用于弹出上传对话框的小部件
        const uploadWidget = node.addWidget(
          'button',
          inputName,
          /* value=*/ '',
          () => {
            fileInput.click()
          }
        )
        uploadWidget.label = '选择要上传的 txt 文件'
        uploadWidget.serialize = false

        return { widget: uploadWidget }
      }
    }
  }
})
