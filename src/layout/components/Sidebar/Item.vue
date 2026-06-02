<script>
export default {
  name: 'MenuItem',
  functional: true,
  props: {
    icon: {
      type: String,
      default: ''
    },
    title: {
      type: String,
      default: ''
    }
  },
  render(h, context) {
    const { icon, title } = context.props
    const vnodes = []

    if (icon) {
      // Element UI font icons (el-icon-*) render as a plain <i> tag so
      // the icon font kicks in; the project's own SVG sprites (e.g.
      // dashboard, peoples) still go through <svg-icon>. Without this
      // split, an "el-icon-foo" value would try to load `#icon-el-icon-foo`
      // from the sprite sheet and silently render nothing.
      if (icon.indexOf('el-icon') === 0) {
        vnodes.push(<i class={`${icon} sub-el-icon`} />)
      } else {
        vnodes.push(<svg-icon icon-class={icon}/>)
      }
    }

    if (title) {
      if (title.length > 5) {
        vnodes.push(<span slot='title' title={(title)}>{(title)}</span>)
      } else {
        vnodes.push(<span slot='title'>{(title)}</span>)
      }
    }
    return vnodes
  }
}
</script>
