jQuery.webshims.ready('form-extend', function($, webshims, window){
	"use strict";
	
	var nan = parseInt('NaN', 10),
		doc = document,
		typeModels = webshims.inputTypes,
		isNumber = function(string){
			return (typeof string == 'number' || (string && string == string * 1));
		},
		supportsType = function(type){
			return ($('<input type="'+type+'" />').attr('type') === type);
		},
		getType = function(elem){
			return (elem.getAttribute('type') || '').toLowerCase();
		},
		isDateTimePart = function(string){
			return (isNumber(string) || (string && string == '0' + (string * 1)));
		},
		//why no step IDL?
		getStep = function(elem, type){
			var step = $.attr(elem, 'step');
			if(step === 'any'){
				return step;
			}
			type = type || getType(elem);
			if(!typeModels[type] || !typeModels[type].step){
				return step;
			}
			step = typeModels.number.asNumber(step);
			return ((!isNaN(step) && step > 0) ? step : typeModels[type].step) * typeModels[type].stepScaleFactor;
		},
		//why no min/max IDL?
		addMinMaxNumberToCache = function(attr, elem, cache){
			if (!(attr+'AsNumber' in cache)) {
				cache[attr+'AsNumber'] = typeModels[cache.type].asNumber(elem.attr(attr));
				if(isNaN(cache[attr+'AsNumber']) && (attr+'Default' in typeModels[cache.type])){
					cache[attr+'AsNumber'] = typeModels[cache.type][attr+'Default'];
				}
			}
		},
		addleadingZero = function(val, len){
			val = ''+val;
			len = len - val.length;
			for(var i = 0; i < len; i++){
				val = '0'+val;
			}
			return val;
		},
		EPS = 1e-7
	;
	
	webshims.addValidityRule('stepMismatch', function(input, val, cache){
		if(val === ''){return false;}
		if(!('type' in cache)){
			cache.type = getType(input[0]);
		}
		//stepmismatch with date is computable, but it would be a typeMismatch (performance)
		if(cache.type == 'date'){
			return false;
		}
		var ret = false, base;
		if(typeModels[cache.type] && typeModels[cache.type].step){
			if( !('step' in cache) ){
				cache.step = getStep(input[0], cache.type);
			}
			
			if(cache.step == 'any'){return false;}
			
			if(!('valueAsNumber' in cache)){
				cache.valueAsNumber = typeModels[cache.type].asNumber( val );
			}
			if(isNaN(cache.valueAsNumber)){return false;}
			
			addMinMaxNumberToCache('min', input, cache);
			base = cache.minAsNumber;
			if(isNaN(base)){
				base = typeModels[cache.type].stepBase || 0;
			}
			
			ret =  Math.abs((cache.valueAsNumber - base) % cache.step);
							
			ret = !(  ret <= EPS || Math.abs(ret - cache.step) <= EPS  );
		}
		return ret;
	});
	
	
	
	[{name: 'rangeOverflow', attr: 'max', factor: 1}, {name: 'rangeUnderflow', attr: 'min', factor: -1}].forEach(function(data, i){
		webshims.addValidityRule(data.name, function(input, val, cache) {
			var ret = false;
			if(val === ''){return ret;}
			if (!('type' in cache)) {
				cache.type = getType(input[0]);
			}
			if (typeModels[cache.type] && typeModels[cache.type].asNumber) {
				if(!('valueAsNumber' in cache)){
					cache.valueAsNumber = typeModels[cache.type].asNumber( val );
				}
				if(isNaN(cache.valueAsNumber)){
					return false;
				}
				
				addMinMaxNumberToCache(data.attr, input, cache);
				
				if(isNaN(cache[data.attr+'AsNumber'])){
					return ret;
				}
				ret = ( cache[data.attr+'AsNumber'] * data.factor <  cache.valueAsNumber * data.factor - EPS );
			}
			return ret;
		});
	});
	
	//IDLs and methods, that aren't part of constrain validation, but strongly tight to it
	webshims.attr('valueAsNumber', {
		elementNames: ['input'],
		getter: function(elem, fn){
			var type = getType(elem);
			return (typeModels[type] && typeModels[type].asNumber) ? 
				typeModels[type].asNumber($.attr(elem, 'value')) :
				nan;
		},
		setter: function(elem, val, fn){
			var type = getType(elem);
			if(typeModels[type] && typeModels[type].numberToString){
				//is NaN a number?
				if(isNaN(val)){
					$.attr(elem, 'value', '');
					return;
				}
				var set = typeModels[type].numberToString(val);
				if(set !==  false){
					$.attr(elem, 'value', set);
				} else {
					throw('INVALID_STATE_ERR: DOM Exception 11');
				}
			} else {
				fn();
			}
		}
	});
	
	webshims.attr('valueAsDate', {
		elementNames: ['input'],
		getter: function(elem, fn){
			var type = getType(elem);
			return (typeModels[type] && typeModels[type].asDate && !typeModels[type].noAsDate) ? 
				typeModels[type].asDate($.attr(elem, 'value')) :
				null;
		},
		setter: function(elem, value, fn){
			var type = getType(elem);
			if(typeModels[type] && typeModels[type].dateToString){
				if(!window.noHTMLExtFixes) {
					throw("there are some serious issues in opera's implementation. don't use!");
				}
				if(value === null){
					$.attr(elem, 'value', '');
					return;
				}
				var set = typeModels[type].dateToString(value);
				if(set !== false){
					$.attr(elem, 'value', set);
				} else {
					throw('INVALID_STATE_ERR: DOM Exception 11');
				}
			} else {
				fn();
			}
		}
	});
	
	var typeProtos = {
		
		number: {
			mismatch: function(val){
				return !(isNumber(val));
			},
			step: 1,
			//stepBase: 0, 0 = default
			stepScaleFactor: 1,
			asNumber: function(str){
				return (isNumber(str)) ? str * 1 : nan;
			},
			numberToString: function(num){
				return (isNumber(num)) ? num : false;
			}
		},
		
		range: {
			minDefault: 0,
			maxDefault: 100
		},
		
		date: {
			mismatch: function(val){
				if(!val || !val.split || !(/\d$/.test(val))){return true;}
				var valA = val.split(/\u002D/);
				if(valA.length !== 3){return true;}
				var ret = false;
				$.each(valA, function(i, part){
					if(!isDateTimePart(part)){
						ret = true;
						return false;
					}
				});
				if(ret){return ret;}
				if(valA[0].length !== 4 || valA[1].length != 2 || valA[1] > 12 || valA[2].length != 2 || valA[2] > 33){
					ret = true;
				}
				return (val !== this.dateToString( this.asDate(val, true) ) );
			},
			step: 1,
			//stepBase: 0, 0 = default
			stepScaleFactor:  86400000,
			asDate: function(val, _noMismatch){
				if(!_noMismatch && this.mismatch(val)){
					return null;
				}
				return new Date(this.asNumber(val, true));
			},
			asNumber: function(str, _noMismatch){
				var ret = nan;
				if(_noMismatch || !this.mismatch(str)){
					str = str.split(/\u002D/);
					ret = Date.UTC(str[0], str[1] - 1, str[2]);
				}
				return ret;
			},
			numberToString: function(num){
				return (isNumber(num)) ? this.dateToString(new Date( num * 1)) : false;
			},
			dateToString: function(date){
				return (date && date.getFullYear) ? date.getUTCFullYear() +'-'+ addleadingZero(date.getUTCMonth()+1, 2) +'-'+ addleadingZero(date.getUTCDate(), 2) : false;
			}
		},
		
		time: {
			mismatch: function(val, _getParsed){
				if(!val || !val.split || !(/\d$/.test(val))){return true;}
				val = val.split(/\u003A/);
				if(val.length < 2 || val.length > 3){return true;}
				var ret = false,
					sFraction;
				if(val[2]){
					val[2] = val[2].split(/\u002E/);
					sFraction = parseInt(val[2][1], 10);
					val[2] = val[2][0];
				}
				$.each(val, function(i, part){
					if(!isDateTimePart(part) || part.length !== 2){
						ret = true;
						return false;
					}
				});
				if(ret){return true;}
				if(val[0] > 23 || val[0] < 0 || val[1] > 59 || val[1] < 0){
					return true;
				}
				if(val[2] && (val[2] > 59 || val[2] < 0 )){
					return true;
				}
				if(sFraction && isNaN(sFraction)){
					return true;
				}
				if(sFraction){
					if(sFraction < 100){
						sFraction *= 100;
					} else if(sFraction < 10){
						sFraction *= 10;
					}
				}
				return (_getParsed === true) ? [val, sFraction] : false;
			},
			step: 60,
			stepBase: 0,
			stepScaleFactor:  1000,
			asDate: function(val){
				val = new Date(this.asNumber(val));
				return (isNaN(val)) ? null : val;
			},
			asNumber: function(val){
				var ret = nan;
				val = this.mismatch(val, true);
				if(val !== true){
					ret = Date.UTC('1970', 0, 1, val[0][0], val[0][1], val[0][2] || 0);
					if(val[1]){
						ret += val[1];
					}
				}
				return ret;
			},
			dateToString: function(date){
				if(date && date.getUTCHours){
					var str = addleadingZero(date.getUTCHours(), 2) +':'+ addleadingZero(date.getUTCMinutes(), 2),
						tmp = date.getSeconds()
					;
					if(tmp != "0"){
						str += ':'+ addleadingZero(tmp, 2);
					}
					tmp = date.getUTCMilliseconds();
					if(tmp != "0"){
						str += '.'+ addleadingZero(tmp, 3);
					}
					return str;
				} else {
					return false;
				}
			}
		},
		
		'datetime-local': {
			mismatch: function(val, _getParsed){
				if(!val || !val.split || (val+'special').split(/\u0054/).length !== 2){return true;}
				val = val.split(/\u0054/);
				return ( typeModels.date.mismatch(val[0]) || typeModels.time.mismatch(val[1], _getParsed) );
			},
			noAsDate: true,
			asDate: function(val){
				val = new Date(this.asNumber(val));
				
				return (isNaN(val)) ? null : val;
			},
			asNumber: function(val){
				var ret = nan;
				var time = this.mismatch(val, true);
				if(time !== true){
					val = val.split(/\u0054/)[0].split(/\u002D/);
					
					ret = Date.UTC(val[0], val[1] - 1, val[2], time[0][0], time[0][1], time[0][2] || 0);
					if(time[1]){
						ret += time[1];
					}
				}
				return ret;
			},
			dateToString: function(date, _getParsed){
				return typeModels.date.dateToString(date) +'T'+ typeModels.time.dateToString(date, _getParsed);
			}
		}
	};
	
	if(!supportsType('number')){
		webshims.addInputType('number', typeProtos.number);
	}
	
	if(!supportsType('range')){
		webshims.addInputType('range', $.extend({}, typeProtos.number, typeProtos.range));
	}
	if(!supportsType('date')){
		webshims.addInputType('date', typeProtos.date);
	}
	if(!supportsType('time')){
		webshims.addInputType('time', $.extend({}, typeProtos.date, typeProtos.time));
	}
	
	if(!supportsType('datetime-local')){
		webshims.addInputType('datetime-local', $.extend({}, typeProtos.date, typeProtos.time, typeProtos['datetime-local']));
	}
	
	//implement set/arrow controls
	(function(){
		var options = webshims.modules['form-number-date'].options;
		var correctBottom = ($.browser.msie && parseInt($.browser.version, 10) < 8) ? 2 : 0;
		var getNextStep = function(input, upDown, cache){
			
			cache = cache || {};
			
			if( !('type' in cache) ){
				cache.type = getType(input);
			}
			if( !('step' in cache) ){
				cache.step = getStep(input, cache.type);
			}
			if( !('valueAsNumber' in cache) ){
				cache.valueAsNumber = typeModels[cache.type].asNumber($.attr(input, 'value'));
			}
			var delta = (cache.step == 'any') ? typeModels[cache.type].step * typeModels[cache.type].stepScaleFactor : cache.step,
				ret
			;
			addMinMaxNumberToCache('min', $(input), cache);
			addMinMaxNumberToCache('max', $(input), cache);
			
			if(isNaN(cache.valueAsNumber)){
				cache.valueAsNumber = typeModels[cache.type].stepBase || 0;
			}
			//make a valid step
			if(cache.step !== 'any'){
				ret = Math.round( ((cache.valueAsNumber - (cache.minAsnumber || 0)) % cache.step) * 1e7 ) / 1e7;
				if(ret &&  Math.abs(ret) != cache.step){
					cache.valueAsNumber = cache.valueAsNumber - ret;
				}
			}
			ret = cache.valueAsNumber + (delta * upDown);
			//using NUMBER.MIN/MAX is really stupid | ToDo: either use disabled state or make this more usable
			if(!isNaN(cache.minAsNumber) && ret < cache.minAsNumber){
				ret = (cache.valueAsNumber * upDown  < cache.minAsNumber) ? cache.minAsNumber : isNaN(cache.maxAsNumber) ? Number.MAX_VALUE : cache.maxAsNumber;
			} else if(!isNaN(cache.maxAsNumber) && ret > cache.maxAsNumber){
				ret = (cache.valueAsNumber * upDown > cache.maxAsNumber) ? cache.maxAsNumber : isNaN(cache.minAsNumber) ? Number.MIN_VALUE : cache.minAsNumber;
			}
			return Math.round( ret * 1e7)  / 1e7;
		};
		
		webshims.modules['form-number-date'].getNextStep = getNextStep;
		
		var doSteps = function(input, type, control){
			if(input.disabled || input.readOnly || $(control).hasClass('step-controls')){return;}
			$.attr(input, 'value',  typeModels[type].numberToString(getNextStep(input, ($(control).hasClass('step-up')) ? 1 : -1, {type: type})));
			$(input).unbind('blur.stepeventshim');
			webshims.triggerInlineForm(input, 'input');
			
			
			if( doc.activeElement ){
				if(doc.activeElement !== input){
					try {input.focus();} catch(e){}
				}
				setTimeout(function(){
					if(doc.activeElement !== input){
						try {input.focus();} catch(e){}
					}
					$(input)
						.one('blur.stepeventshim', function(){
							$(input).trigger('change');
						})
					;
				}, 0);
				
			}
		};
		
		
		if(options.stepArrows){
			var disabledReadonly = {
				elementNames: ['input'],
				// don't change getter
				setter: function(elem, value, fn){
					fn();
					var stepcontrols = $.data(elem, 'step-controls');
					if(stepcontrols){
						stepcontrols[ (elem.disabled || elem.readonly) ? 'addClass' : 'removeClass' ]('disabled-step-control');
					}
				}
			};
			webshims.attr('disabled', disabledReadonly);
			webshims.attr('readonly', disabledReadonly);
			
		}
		var stepKeys = {
			38: 1,
			40: -1
		};
		webshims.addReady(function(context, contextElem){
			
			//ui for numeric values
			if(options.stepArrows){
				$('input', context).add(contextElem.filter('input')).each(function(){
					var type = getType(this);
					if(!typeModels[type] || !typeModels[type].asNumber || !options.stepArrows || (options.stepArrows !== true && !options.stepArrows[type])){return;}
					var elem = this,
						dir 	= ($(this).css('direction') == 'rtl') ? 
							{
								action: 'insertBefore',
								side: 'Left',
								otherSide: 'right'
							} :
							{
								action: 'insertAfter',
								side: 'Right',
								otherSide: 'Left'
							}
					;
					var controls = $('<span class="step-controls" unselectable="on"><span class="step-up" /><span class="step-down" /></span>')	
						[dir.action](this)
						.bind('selectstart dragstart', function(){
							return false;
						})
						.bind('mousedown mousepress', function(e){
							doSteps(elem, type, e.target);
							return false;
						})
					;
					
					$(this)
						.addClass('has-step-controls')
						.data('step-controls', controls)
						.attr({
							readonly: this.readOnly,
							disabled: this.disabled,
							autocomplete: 'off'
						})
						.bind(($.browser.msie) ? 'keydown' : 'keypress', function(e){
							if(this.disabled || this.readOnly || !stepKeys[e.keyCode]){return;}
							$.attr(this, 'value',  typeModels[type].numberToString(getNextStep(this, stepKeys[e.keyCode], {type: type})));
							webshims.triggerInlineForm(this, 'input');
							return false;
						})
					;
					
					if(options.calculateWidth){
						var jElm = $(this);
						var inputDim = {
							w: jElm.width()
						};
						if(!inputDim.w){return;}
						var controlDim = {
							mL: (parseInt(controls.css('margin'+dir.otherSide), 10) || 0),
							w: controls.outerWidth()
						};
						inputDim.mR = (parseInt(jElm.css('margin'+dir.side), 10) || 0);
						if(!correctBottom){
							controls.css('marginBottom', (parseInt(jElm.css('paddingBottom'), 10) || 0) / -2 );
						} else {
							controls.css('marginBottom', ((jElm.innerHeight() - (controls.height() / 2)) / 2) - 1 );
						}
						if(inputDim.mR){
							jElm.css('margin'+dir.side, 0);
						}
						//is inside
						if( controlDim.mL <= (controlDim.w * -1) ){
							controls.css('margin'+dir.side,  Math.floor(Math.abs(controlDim.w + controlDim.mL) + inputDim.mR));
							jElm.css('padding'+dir.side, (parseInt($(this).css('padding'+dir.side), 10) || 0) + Math.abs(controlDim.mL));
							jElm.css('width', Math.floor(inputDim.w + controlDim.mL));
						} else {
							controls.css('margin'+dir.side, inputDim.mR);
							jElm.css('width',  Math.floor(inputDim.w - controlDim.mL - controlDim.w));
						}
						
					}
				});
			}
		});
	})();
	
	// add support for new input-types
	webshims.attr('type', {
		elementNames: ['input'],
		getter: function(elem, fn){
			var type = getType(elem);
			return (webshims.inputTypes[type]) ? type : elem.type || elem.getAttribute('type');
		},
		//don't change setter
		setter: true
	});
	
	webshims.createReadyEvent('form-number-date');
	
}, true);
