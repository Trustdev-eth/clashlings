// Keep portrait tablets on a bottom dock and short landscape phones on a side dock.
export function battleLayout(width,height,playing=false){
 const phone=width<760,portrait=height>width*1.05,shortLandscape=width>=520&&height<520;
 return {dock:shortLandscape?'side':phone||portrait?'bottom':'side',sidebar:!playing&&width>=900&&!portrait,immersive:playing&&phone};
}
